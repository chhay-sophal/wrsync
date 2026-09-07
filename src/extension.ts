import * as vscode from 'vscode';
import { getAuthStatus, initAuth, login, logout } from './auth';

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
		})
	);
}

export function deactivate() {}
