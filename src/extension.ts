'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const LINK_MD_SECTION = '文内链接';

interface LNK {
	idx: Number;
	text: string;
	link: string;
}

interface SUP {
	idx: Number;
	link: string;
	html: string;
	text: string;
}

interface BaseData {
	mdText: string;
	lnks: Array<LNK>;
	sups: Array<SUP>;
}

const getDoc = () => {
	let editor = vscode.window.activeTextEditor;

	if (editor === undefined) {
		return;
	}

	return editor.document;
};

const getLnksFromMd = (md: string): Array<LNK> => {
	let reg = /\[([^\[]+)\]\(([^\)]+)\)/g;
	let res;
	let idx = 0;
	let rets: LNK[] = [];

	while ((res = reg.exec(md)) !== null) {
		rets.push({
			idx: idx++,
			text: res[1],
			link: res[2],
		});
	}

	return rets;
};

const getSupsFromMd = (md: string): Array<SUP> => {
	let reg = /\<sup\>(\d+)?\<\/sup\>/g;
	let res;
	let tags = [];
	let rets: SUP[] = [];

	// 找到现有匹配的sups标签
	while ((res = reg.exec(md)) !== null) {
		tags.push(1);
	}

	let regSup = new RegExp('#.*?' + LINK_MD_SECTION + '([\\s|\\S]*)?\\n#.*', 'm');
	let links = md.match(regSup);

	if (links === null || links[1] === undefined) {
		if (tags.length === 0) {
			return rets;
		} else {
			throw new Error('Unmatched markdown link!');
		}
	}

	// 摘取目前在LINK_MD_SECTION里面的链接
	let linkList = links[1]
		.trim()
		.split('\n')
		.map(el => {
			let node = el
				.trim()
				.replace(/\d*?\.\s*/, '')
				.split(/\s+?/);

			if (node.length > 1) {
				return {
					link: node[0],
					text: node[1].replace(/<!--\s*?(.*)?\s*?-->/, '$1').trim(),
				};
			}

			return {
				link: node[0],
				text: node[0],
			};
		});

	if (tags.length !== linkList.length) {
		throw new Error('Unmatched markdown link!');
	}

	return linkList.map((el, i) => {
		return Object.assign(el, {
			idx: i,
			html: `<sup>${i + 1}</sup>`,
		});
	});
};

const changeLnks2Sups = (baseData: BaseData) => {
	let mdText = baseData.mdText;
	let sups = baseData.sups;
	let lnks = baseData.lnks;

	console.log(sups, lnks);
};

const getBaseData = (): BaseData | undefined => {
	let doc = getDoc();

	if (doc === undefined) {
		return;
	}

	let mdText = doc.getText();

	// 获取markdown里面的现有链接
	let lnks = getLnksFromMd(mdText);

	// 获取markdown里面的<sup>\d+</sup>，并与现有的配对
	let sups = getSupsFromMd(mdText);

	return {
		mdText,
		lnks,
		sups,
	};
};

const lnk2sup = () => {
	let baseData = getBaseData();

	if (baseData !== undefined) {
		changeLnks2Sups(baseData);
	}
};

const sup2lnk = () => {
	let baseData = getBaseData();

	if (baseData !== undefined) {
		changeLnks2Sups(baseData);
	}
};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "wechat" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposableLnk2sup = vscode.commands.registerCommand('extension.lnk2sup', () => {
		// The code you place here will be executed every time your command is executed

		lnk2sup();
	});

	let disposableSup2Lnk = vscode.commands.registerCommand('extension.sup2lnk', () => {
		// The code you place here will be executed every time your command is executed

		sup2lnk();
	});

	context.subscriptions.push(disposableLnk2sup);
	context.subscriptions.push(disposableSup2Lnk);

	// Display a message box to the user
	vscode.window.showInformationMessage('Success!');
}

// this method is called when your extension is deactivated
export function deactivate() {}
