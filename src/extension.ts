'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

const LINK_MD_SECTION = '文内链接';
const LNK_TO_SUP_OK = '已经将所有链接变为角标形式';
const SUP_TO_LNK_OK = '已经将所有角标变为链接形式';

interface LNK {
	idx: number;
	text: string;
	link: string;
	markdown: string;
}

interface SUP {
	idx: number;
	link: string;
	html: string;
	text: string;
	search: RegExp;
}

interface BaseData {
	mdText: string;
	lnks: LNK[];
	sups: SUP[];
}

function searchIdxFromMarkdownByLnks(lnk: LNK, md: string): number {
	return md.indexOf(lnk.markdown);
}

function searchIdxFromMarkdownBySups(sup: SUP, md: string): number {
	return md.search(sup.search);
}

const getDoc = () => {
	let editor = vscode.window.activeTextEditor;

	if (editor === undefined) {
		return;
	}

	return editor.document;
};

const getLnksFromMd = (md: string): LNK[] => {
	let reg = /!{0,1}\[([^\[]+)\]\(([^\)]+)\)/g;
	let res;
	let idx = 0;
	let rets: LNK[] = [];

	while ((res = reg.exec(md)) !== null) {
		if (res[0][0] === '!') {
			continue;
		}
		rets.push({
			idx: idx++,
			text: res[1],
			link: res[2],
			markdown: res[0],
		});
	}

	return rets;
};

const getSupsFromMd = (md: string): SUP[] => {
	let reg = /(<!--begin sup text-->(.*)?<!--end sup text-->){0,1}<sup>(\d+)?<\/sup>/g;
	let res;
	let tags = [];
	let rets: SUP[] = [];

	// 找到现有匹配的sups标签
	while ((res = reg.exec(md)) !== null) {
		tags.push(1);
	}

	// let regSup = new RegExp('#.*?' + LINK_MD_SECTION + '([\\s|\\S]*)?\\n#.*', 'm');
	// 找到文末的“文内链接”段
	let regSup = new RegExp('#.*?' + LINK_MD_SECTION + '.*\\n+?((?:^|\\n)\\d+.\\s{0,}.*\\n)*', 'm');
	let links = md.match(regSup);

	if (links === null || links[0] === undefined) {
		if (tags.length === 0) {
			return rets;
		} else {
			throw new Error('Unmatched markdown link!');
		}
	}

	// 摘取目前在LINK_MD_SECTION里面的链接
	let linkText = links[0].replace(new RegExp('#.*?' + LINK_MD_SECTION), '').trim();
	let linkList = linkText
		.trim()
		.split('\n')
		.map(el => {
			let node = el
				.trim()
				.replace(/\d*?\.\s*/, '')
				.split(/\s+?/);

			if (node.length > 1) {
				return { link: node[0], text: node[1].replace(/<!--\s*?(.*)?\s*?-->/, '$1').trim() };
			}

			return { link: node[0], text: node[0] };
		});

	if (tags.length !== linkList.length) {
		throw new Error('Unmatched markdown link!');
	}

	return linkList.map((el, i) => {
		return Object.assign(el, {
			idx: i,
			html: `<!--begin sup text-->${el.text}<!--end sup text--><sup>${i + 1}</sup>`,
			search: new RegExp(`(<!--begin sup text-->${el.text}<!--end sup text-->){0,}<sup>(\\d+)?<\/sup>`),
		});
	});
};

// 更新sup在前文的<sup>标签
const inHereReplaceSupString2Sup = (mdText: string, idxS: number, node: SUP, newSups: SUP[]): string => {
	let prev = mdText.slice(0, idxS);
	let newSupText = `<!--begin sup text-->${node.text} <!--end sup text--><sup>${newSups.length + 1}</sup>`;
	let tail = mdText.slice(idxS).replace(node.search, '');

	return [prev, newSupText, tail].join('');
};

// 更新link在前文的markdown标签
const inHereReplaceLnkString2Sup = (mdText: string, idxL: number, node: LNK, newSups: SUP[]): string => {
	let prev = mdText.slice(0, idxL);
	let newSupText = `<!--begin sup text-->${node.text}<!--end sup text--><sup>${newSups.length + 1}</sup>`;
	let tail = mdText.slice(idxL).slice(node.markdown.length);

	return [prev, newSupText, tail].join('');
};

// 更新sup在前文的<sup>标签为markdown格式
const inHereReplaceSupString2Lnk = (mdText: string, idxS: number, node: SUP, newLnks: LNK[]): string => {
	let prev = mdText.slice(0, idxS);
	let newLnkText = `[${node.text}](${node.link})`;
	let tail = mdText.slice(idxS).replace(node.search, '');
	return [prev, newLnkText, tail].join('');
};

// 更新lnk在前文的markdown
const inHereReplaceLnkString2Lnk = (mdText: string, idxL: number, nodeL: LNK, newLnks: LNK[]): string => {
	let prev = mdText.slice(0, idxL);
	let newLnkText = `[${nodeL.text}](${nodeL.link})`;
	let tail = mdText.slice(idxL).slice(nodeL.markdown.length);

	return [prev, newLnkText, tail].join('');
};

const updateSupSection = (mdText: string, newSups: SUP[]): string => {
	let regSup = new RegExp('#.*?' + LINK_MD_SECTION);

	if (mdText.match(regSup)) {
		// 现在有这个节
		let regSup2 = new RegExp('#.*?' + LINK_MD_SECTION + '[\\s|.]{0,}((\\d+.[\\s|\\S]+?)\\n)*', 'm');

		mdText = mdText.replace(
			regSup2,
			(text): string => {
				return (
					text.split('\n')[0] +
					'\n' +
					newSups.reduce((prev: string, curr: SUP) => {
						return prev + '\n' + '1.' + ' ' + curr.link + ' <!--' + curr.text + '-->';
					}, '') +
					'\n'
				);
			}
		);
		return mdText;
	} else {
		// 直接追加
		// 先确定此节的层级：找第一个层级，然后加在最后
		let matches = mdText.match(/^(#+)(.*)/);
		let level = 1;
		if (matches !== null && matches[0] !== null) {
			let text = matches[0].match(/^(#+)/);

			if (text !== null && text[1] !== null) {
				level = text[1].length;
			}
		}

		mdText =
			mdText +
			'\n' +
			Array(level)
				.fill('#')
				.join('') +
			' ' +
			LINK_MD_SECTION +
			'\n';

		return (
			newSups.reduce((prev: string, curr: SUP) => {
				return prev + '\n' + '1.' + ' ' + curr.link + ' <!--' + curr.text + '-->';
			}, mdText) + '\n'
		);
	}
};

const cleanSupSection = (mdText: string) => {
	let regSup = new RegExp('#.*?' + LINK_MD_SECTION + '[\\s|.]{0,}((\\d+.[\\s|\\S]+?)\\n)*', 'm');

	return mdText.replace(regSup, '');
};

const changeLnks2Sups = (baseData: BaseData): string => {
	let mdText = baseData.mdText;
	let sups = baseData.sups;
	let lnks = baseData.lnks;

	let newSups: SUP[] = [];

	let i = 0,
		j = 0,
		idxS: number,
		idxL: number,
		nodeS: SUP,
		nodeL: LNK;

	let configLnks = (idxL: number, nodeL: LNK) => {
		mdText = inHereReplaceLnkString2Sup(mdText, idxL, nodeL, newSups);
		newSups = newSups.concat([
			{
				idx: newSups.length,
				link: nodeL.link,
				html: `<!--begin sup text-->${nodeL.text}<!--end sup text--><sup>${newSups.length + 1}</sup>`,
				text: nodeL.text,
				search: new RegExp(`(<!--begin sup text-->${nodeL.text}<!--end sup text-->){0,}<sup>(\\d+)?<\/sup>`),
			},
		]);
	};

	let configSups = (idxS: number, nodeS: SUP) => {
		mdText = inHereReplaceSupString2Sup(mdText, idxS, nodeS, newSups);
		newSups = newSups.concat([
			{
				idx: newSups.length,
				link: nodeS.link,
				html: `<!--begin sup text-->${nodeS.text}<!--end sup text--><sup>${newSups.length + 1}</sup>`,
				text: nodeS.text,
				search: new RegExp(`(<!--begin sup text-->${nodeL.text}<!--end sup text-->){0,}<sup>(\\d+)?<\/sup>`),
			},
		]);
	};

	while (i < sups.length || j < lnks.length) {
		nodeS = sups[i];
		nodeL = lnks[j];

		idxS = nodeS === undefined ? -1 : searchIdxFromMarkdownBySups(nodeS, mdText);
		idxL = nodeL === undefined ? -1 : searchIdxFromMarkdownByLnks(nodeL, mdText);

		if (nodeS === undefined && nodeL !== undefined) {
			configLnks(idxL, nodeL);
			j++;
			continue;
		}

		if (nodeL === undefined && nodeS !== undefined) {
			configSups(idxS, nodeS);
			i++;
			continue;
		}

		if (idxS < idxL) {
			configSups(idxS, nodeS);
			i++;
			continue;
		} else {
			configLnks(idxL, nodeL);
			j++;
			continue;
		}
	}

	return updateSupSection(mdText, newSups);
};

const changeSups2Lnk = (baseData: BaseData): string => {
	let mdText = baseData.mdText;
	let sups = baseData.sups;
	let lnks = baseData.lnks;

	let newLnks: LNK[] = [];

	let i = 0,
		j = 0,
		idxS: number,
		idxL: number,
		nodeS: SUP,
		nodeL: LNK;

	let configLnks = (idxL: number, nodeL: LNK) => {
		mdText = inHereReplaceLnkString2Lnk(mdText, idxL, nodeL, newLnks);
		newLnks = newLnks.concat([
			{
				idx: newLnks.length,
				link: nodeL.link,
				markdown: `[${nodeL.text}](${nodeL.link})`,
				text: nodeL.text,
			},
		]);
	};

	let configSups = (idxS: number, nodeS: SUP) => {
		mdText = inHereReplaceSupString2Lnk(mdText, idxS, nodeS, newLnks);
		newLnks = newLnks.concat([
			{
				idx: newLnks.length,
				link: nodeS.link,
				markdown: `[${nodeS.text}](${nodeS.link})`,
				text: nodeS.text,
			},
		]);
	};

	while (i < sups.length || j < lnks.length) {
		nodeS = sups[i];
		nodeL = lnks[j];

		idxS = nodeS === undefined ? -1 : searchIdxFromMarkdownBySups(nodeS, mdText);
		idxL = nodeL === undefined ? -1 : searchIdxFromMarkdownByLnks(nodeL, mdText);

		if (nodeS === undefined && nodeL !== undefined) {
			configLnks(idxL, nodeL);
			j++;
			continue;
		}

		if (nodeL === undefined && nodeS !== undefined) {
			configSups(idxS, nodeS);
			i++;
			continue;
		}

		if (idxS < idxL) {
			configSups(idxS, nodeS);
			i++;
			continue;
		} else {
			configLnks(idxL, nodeL);
			j++;
			continue;
		}
	}

	return cleanSupSection(mdText);
};

const replaceWholeText = (text: string) => {
	let doc = getDoc();

	if (doc === undefined) {
		return;
	}

	let firstLine = doc.lineAt(0);
	let lastLine = doc.lineAt(doc.lineCount - 1);
	let textRange = new vscode.Range(
		0,
		firstLine.range.start.character,
		doc.lineCount - 1,
		lastLine.range.end.character
	);

	if (vscode.window.activeTextEditor === undefined) {
		return;
	}

	vscode.window.activeTextEditor.edit(editBuilder => {
		editBuilder.replace(textRange, text);
	});
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
		let newText = changeLnks2Sups(baseData);
		replaceWholeText(newText);
	}
};

const sup2lnk = () => {
	let baseData = getBaseData();

	if (baseData !== undefined) {
		let newText = changeSups2Lnk(baseData);
		replaceWholeText(newText);
	}
};

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	let disposableLnk2sup = vscode.commands.registerCommand('extension.linksup.lnk2sup', () => {
		// The code you place here will be executed every time your command is executed

		lnk2sup();
		vscode.window.showInformationMessage(LNK_TO_SUP_OK);
	});

	let disposableSup2Lnk = vscode.commands.registerCommand('extension.linksup.sup2lnk', () => {
		// The code you place here will be executed every time your command is executed
		sup2lnk();
		vscode.window.showInformationMessage(SUP_TO_LNK_OK);
	});

	context.subscriptions.push(disposableLnk2sup);
	context.subscriptions.push(disposableSup2Lnk);

	// Display a message box to the user
}

// this method is called when your extension is deactivated
export function deactivate() {}
