import * as vscode from 'vscode';
import { getAuthStatus, initAuth, login, logout } from './auth';
import {
	getWebResourceDetails,
	listEnvironments,
	listSolutions,
	listWebResourcesForSolution,
} from './dataverseClient';
import { openPanel } from './panel';

export function activate(context: vscode.ExtensionContext) {
	initAuth(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('wrsync.signIn', async () => {
			try {
				const { username } = await login();
				vscode.window.showInformationMessage(`Signed in as ${username}`);
			} catch (err) {
				vscode.window.showErrorMessage(`Sign-in failed: ${(err as Error).message}`);
			}
		}),

		vscode.commands.registerCommand('wrsync.signOut', async () => {
			await logout();
			vscode.window.showInformationMessage('Signed out.');
		}),

		vscode.commands.registerCommand('wrsync.showAuthStatus', async () => {
			const status = await getAuthStatus();
			vscode.window.showInformationMessage(
				status.signedIn ? `Signed in as ${status.username}` : 'Not signed in'
			);
		}),

		vscode.commands.registerCommand('wrsync.pickEnvironment', async () => {
			const environments = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: 'Loading environments…' },
				() => listEnvironments()
			);
			if (environments.length === 0) {
				vscode.window.showInformationMessage('No Dataverse environments found for this account.');
				return;
			}
			const picked = await vscode.window.showQuickPick(
				environments.map((env) => ({ label: env.displayName, description: env.apiUrl, env })),
				{ placeHolder: 'Select a Dataverse environment' }
			);
			if (picked) {
				vscode.window.showInformationMessage(`Picked: ${picked.env.displayName} (${picked.env.apiUrl})`);
			}
		}),

		vscode.commands.registerCommand('wrsync.browseWebResources', async () => {
			try {
				const environments = await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: 'Loading environments…' },
					() => listEnvironments()
				);
				if (environments.length === 0) {
					vscode.window.showInformationMessage('No Dataverse environments found for this account.');
					return;
				}
				const pickedEnv = await vscode.window.showQuickPick(
					environments.map((env) => ({ label: env.displayName, description: env.apiUrl, env })),
					{ placeHolder: 'Select a Dataverse environment' }
				);
				if (!pickedEnv) {return;}

				const solutions = await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: 'Loading solutions…' },
					() => listSolutions(pickedEnv.env.apiUrl)
				);
				if (solutions.length === 0) {
					vscode.window.showInformationMessage('No unmanaged solutions found in this environment.');
					return;
				}
				const pickedSolution = await vscode.window.showQuickPick(
					solutions.map((sol) => ({ label: sol.friendlyname, description: sol.uniquename, sol })),
					{ placeHolder: 'Select a solution' }
				);
				if (!pickedSolution) {return;}

				const resources = await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: 'Loading web resources…' },
					() => listWebResourcesForSolution(pickedEnv.env.apiUrl, pickedSolution.sol.solutionid)
				);
				if (resources.length === 0) {
					vscode.window.showInformationMessage('No web resources found in this solution.');
					return;
				}
				const pickedResource = await vscode.window.showQuickPick(
					resources.map((r) => ({ label: r.name, description: r.displayname, r })),
					{ placeHolder: `Select a web resource (${resources.length} found)` }
				);
				if (!pickedResource) {return;}

				const details = await getWebResourceDetails(pickedEnv.env.apiUrl, pickedResource.r.webresourceid);
				vscode.window.showInformationMessage(
					`${details.displayname} — type ${details.webresourcetype}, managed: ${details.ismanaged}`
				);
			} catch (err) {
				vscode.window.showErrorMessage(`Failed to browse web resources: ${(err as Error).message}`);
			}
		}),

		vscode.commands.registerCommand('wrsync.openPanel', () => {
			openPanel();
		})
	);
}

export function deactivate() {}
