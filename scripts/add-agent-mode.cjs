const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'index.ts');
let content = fs.readFileSync(filePath, 'utf-8');

// 检查view命令输出部分是否已有agent代码（更精确的检查）
if (content.includes('isLiked: (info as any).liked || false') && content.includes('...(info as any).liked ? []')) {
  console.log('Agent output code already exists in view command');
  process.exit(0);
}

// 找到view命令输出部分，添加agent模式
const lines = content.split('\n');
let inViewCommand = false;
let braceCount = 0;
let insertIndex = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // 检测是否在view命令的action中
  if (line.includes("command('view')")) {
    inViewCommand = true;
    braceCount = 0;
  }

  // 找到console.log(chalk.bold位置，在info被设置之后
  if (inViewCommand && line.includes('console.log(chalk.bold') && line.includes('(info as any).title')) {
    insertIndex = i;
    break;
  }
}

if (insertIndex > 0) {
  const agentCode = `    // Agent 模式输出
    if (opts.agent) {
      const response: AgentResponse = {
        success: true,
        data: {
          note: {
            id: note.id,
            index: parseInt(num, 10),
            title: (info as any).title || '',
            author: (info as any).author || '',
            description: (info as any).desc || '',
            imageCount: (info as any).imgCount || 0,
            likes: (info as any).likes || '0',
            collects: (info as any).collects || '0',
            isLiked: (info as any).liked || false,
            isCollected: (info as any).collected || false,
            url: note.url,
          },
        },
        actions: [
          ...(info as any).liked ? [] : [{ name: 'like', description: '点赞笔记', command: 'xhs xiaohongshu like' }],
          ...(info as any).collected ? [] : [{ name: 'collect', description: '收藏笔记', command: 'xhs xiaohongshu collect' }],
          { name: 'comment', description: '评论笔记', command: 'xhs xiaohongshu comment <内容>' },
          { name: 'browse', description: '模拟浏览', command: 'xhs xiaohongshu browse --duration 5000' },
          { name: 'back', description: '返回列表', command: 'xhs xiaohongshu back' },
        ],
        context: {
          currentNoteId: note.id,
          currentNoteIndex: parseInt(num, 10),
          feedCount: feedCache.length,
        },
      };
      console.log(JSON.stringify(response, null, 2));
      return;
    }

`;
  lines.splice(insertIndex, 0, agentCode);
  content = lines.join('\n');
  fs.writeFileSync(filePath, content);
  console.log('Added agent output code at line', insertIndex);
} else {
  console.log('Could not find insertion point');
}
