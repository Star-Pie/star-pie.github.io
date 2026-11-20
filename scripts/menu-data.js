function app(id, name, chineseName = name) {
  return { id, image: './assets/apps/' + id + '.png', label: { en: name, 'zh-CN': chineseName } };
}

function action(id, icon, chineseName, name) {
  return { id, icon, label: { en: name, 'zh-CN': chineseName } };
}

export const presets = {
  everyday: [
    app('word', 'Word'), app('excel', 'Excel'), app('powerpoint', 'PowerPoint'),
    action('capture', 'camera', '截图', 'Capture'), app('wechat', 'WeChat', '微信'),
    app('wps', 'WPS'), app('edge', 'Edge'), action('copy', 'copy', '复制', 'Copy')
  ],
  creative: [
    app('photoshop', 'Photoshop'), app('premiere', 'Premiere'), app('jianying', 'Jianying', '剪映'),
    action('capture', 'camera', '截图', 'Capture'), app('pixpin', 'PixPin'),
    app('paint', 'Paint', '画图'), app('acrobat', 'Acrobat'), action('assets', 'folder', '素材库', 'Assets')
  ],
  developer: [
    app('vscode', 'VS Code'), app('git-bash', 'Git Bash'), app('windows-terminal', 'Terminal', '终端'),
    action('project', 'folder', '项目', 'Project'), app('python', 'Python'),
    app('powershell', 'PowerShell'), app('chrome', 'Chrome'), action('search', 'search', '查找', 'Find')
  ]
};

export function polar(radius, degrees, cx = 300, cy = 300) {
  const angle = degrees * Math.PI / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

/** A rounded annular sector, with a real gap between adjacent actions. */
export function sectorPath(index, count = 8, outer = 241, inner = 123) {
  if (!Number.isInteger(count) || count < 3 || !Number.isInteger(index) || index < 0 || index >= count || inner <= 0 || outer <= inner + 20) {
    throw new RangeError('Invalid radial menu geometry');
  }
  const sweep = 360 / count;
  const start = -90 + index * sweep - sweep / 2 + 2;
  const end = start + sweep - 4;
  const p = (radius, angle) => polar(radius, angle).map(n => n.toFixed(3)).join(' ');
  const round = 2.5;
  return [
    'M ' + p(outer, start + round),
    'A ' + outer + ' ' + outer + ' 0 0 1 ' + p(outer, end - round),
    'Q ' + p(outer, end) + ' ' + p(outer - 12, end),
    'L ' + p(inner + 12, end),
    'Q ' + p(inner, end) + ' ' + p(inner, end - round * 2),
    'A ' + inner + ' ' + inner + ' 0 0 0 ' + p(inner, start + round * 2),
    'Q ' + p(inner, start) + ' ' + p(inner + 12, start),
    'L ' + p(outer - 12, start),
    'Q ' + p(outer, start) + ' ' + p(outer, start + round),
    'Z'
  ].join(' ');
}
