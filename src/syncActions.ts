import * as vscode from 'vscode';
import {
	getOthersChanges,
	getWebResourceContent,
	publishWebResources,
	updateWebResourceContent,
} from './dataverseClient';
import { deleteLink, type ResourceLink } from './linksStore';
import { notifyRemoteContentChanged, scheduleModifiedCountRefresh } from './modifiedTracker';
import { getWorkspaceFileContent, replaceWorkspaceFileContent } from './workspaceFiles';

/** One linked web resource to publish: its local file's content is uploaded, then published. */
export interface PublishItem {
	webresourceId: string;
	name: string;
	localPath: string;
}

function host(apiUrl: string): string {
	try {
		return new URL(apiUrl).hostname;
	} catch {
		return apiUrl;
	}
}

/** Asks before publishing - naming the target environment, and warning about any resource
 * someone else changed last (publishing would overwrite their change) - then uploads every
 * item's local content and publishes them together. Used by the tree and "Publish This File".
 * Returns whether anything was published. */
export async function confirmAndPublish(apiUrl: string, items: PublishItem[]): Promise<boolean> {
	if (items.length === 0) {return false;}
	const target = host(apiUrl);

	const othersChanges = await getOthersChanges(apiUrl, items.map((i) => i.webresourceId)).catch(() => null);
	const nameById = new Map(items.map((i) => [i.webresourceId.toLowerCase(), i.name]));
	const lines: string[] = [];
	if (items.length > 1) {
		lines.push(items.map((i) => `• ${i.name}`).join('\n'), '');
	}
	if (othersChanges === null) {
		lines.push("Couldn't check whether someone else changed these resources.");
	} else if (othersChanges.length > 0) {
		lines.push('Changed by someone else - publishing will overwrite their changes:');
		for (const change of othersChanges) {
			const when = change.modifiedon ? `, ${new Date(change.modifiedon).toLocaleString()}` : '';
			lines.push(
				`• ${nameById.get(change.webresourceId.toLowerCase()) ?? change.webresourceId}: ${change.modifiedbyname ?? 'an unknown user'}${when}`
			);
		}
	} else {
		lines.push(`Local content will overwrite what's in ${target} and be published.`);
	}

	const confirmLabel = othersChanges?.length ? 'Publish Anyway' : 'Publish';
	const title = items.length === 1 ? `Publish ${items[0].name} to ${target}?` : `Publish ${items.length} web resources to ${target}?`;
	const answer = await vscode.window.showWarningMessage(title, { modal: true, detail: lines.join('\n') }, confirmLabel);
	if (answer !== confirmLabel) {return false;}

	const failed: string[] = [];
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: items.length === 1 ? `Publishing ${items[0].name}...` : `Publishing ${items.length} web resources...`,
		},
		async () => {
			const results = await Promise.allSettled(
				items.map(async (item) => {
					const content = await getWorkspaceFileContent(item.localPath);
					await updateWebResourceContent(apiUrl, item.webresourceId, Buffer.from(content, 'utf-8').toString('base64'));
					return item;
				})
			);
			const uploaded = results.flatMap((r, i) => {
				if (r.status === 'fulfilled') {return [r.value.webresourceId];}
				failed.push(`${items[i].name}: ${(r.reason as Error).message}`);
				return [];
			});
			if (uploaded.length > 0) {await publishWebResources(apiUrl, uploaded);}
		}
	);
	notifyRemoteContentChanged();
	scheduleModifiedCountRefresh();

	if (failed.length > 0) {
		vscode.window.showErrorMessage(`Some web resources couldn't be published:\n${failed.join('\n')}`);
	} else {
		vscode.window.showInformationMessage(
			items.length === 1 ? `Published ${items[0].name} to ${target}.` : `Published ${items.length} web resources to ${target}.`
		);
	}
	return failed.length < items.length;
}

/** Replaces the linked local file with the resource's current Dataverse content, after a
 * confirmation. Goes through the editor (see replaceWorkspaceFileContent), so an open editor
 * updates in place and unsaved changes are refused rather than lost. */
export async function confirmAndPull(apiUrl: string, item: PublishItem): Promise<boolean> {
	const answer = await vscode.window.showWarningMessage(
		`Replace ${item.localPath} with the Dataverse version?`,
		{
			modal: true,
			detail: `${item.localPath} will be overwritten with the current content of ${item.name}, and your local changes to it will be lost. Use Compare first to keep some of them.`,
		},
		'Pull'
	);
	if (answer !== 'Pull') {return false;}
	const base64 = await getWebResourceContent(apiUrl, item.webresourceId);
	const text = Buffer.from(base64, 'base64').toString('utf-8');
	// A leading BOM is an encoding marker, not content; the document keeps its own encoding.
	await replaceWorkspaceFileContent(item.localPath, text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
	scheduleModifiedCountRefresh();
	return true;
}

/** Removes a link after a confirmation. Neither the file nor the web resource changes. */
export async function confirmAndUnlink(link: ResourceLink): Promise<boolean> {
	const answer = await vscode.window.showWarningMessage(
		`Unlink ${link.webresourceName}?`,
		{ modal: true, detail: `It will no longer be linked to ${link.localPath}. Neither the file nor the web resource is changed.` },
		'Unlink'
	);
	if (answer !== 'Unlink') {return false;}
	await deleteLink(link.id);
	scheduleModifiedCountRefresh();
	return true;
}
