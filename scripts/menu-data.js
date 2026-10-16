export const presets = {
  "everyday": [
    {
      "id": "files",
      "icon": "folder",
      "label": {
        "zh-CN": "文件",
        "en": "Files"
      }
    },
    {
      "id": "apps",
      "icon": "app",
      "label": {
        "zh-CN": "应用",
        "en": "Apps"
      }
    },
    {
      "id": "capture",
      "icon": "camera",
      "label": {
        "zh-CN": "截图",
        "en": "Capture"
      }
    },
    {
      "id": "windows",
      "icon": "monitor",
      "label": {
        "zh-CN": "窗口",
        "en": "Windows"
      }
    },
    {
      "id": "search",
      "icon": "search",
      "label": {
        "zh-CN": "搜索",
        "en": "Search"
      }
    },
    {
      "id": "copy",
      "icon": "copy",
      "label": {
        "zh-CN": "复制",
        "en": "Copy"
      }
    },
    {
      "id": "browser",
      "icon": "globe",
      "label": {
        "zh-CN": "浏览器",
        "en": "Browser"
      }
    },
    {
      "id": "music",
      "icon": "music",
      "label": {
        "zh-CN": "音乐",
        "en": "Music"
      }
    }
  ],
  "creative": [
    {
      "id": "assets",
      "icon": "folder",
      "label": {
        "zh-CN": "素材",
        "en": "Assets"
      }
    },
    {
      "id": "brush",
      "icon": "pen",
      "label": {
        "zh-CN": "画笔",
        "en": "Brush"
      }
    },
    {
      "id": "capture",
      "icon": "camera",
      "label": {
        "zh-CN": "截图",
        "en": "Capture"
      }
    },
    {
      "id": "layers",
      "icon": "layers",
      "label": {
        "zh-CN": "图层",
        "en": "Layers"
      }
    },
    {
      "id": "search",
      "icon": "search",
      "label": {
        "zh-CN": "搜索",
        "en": "Search"
      }
    },
    {
      "id": "duplicate",
      "icon": "copy",
      "label": {
        "zh-CN": "复制",
        "en": "Duplicate"
      }
    },
    {
      "id": "reference",
      "icon": "globe",
      "label": {
        "zh-CN": "参考",
        "en": "References"
      }
    },
    {
      "id": "music",
      "icon": "music",
      "label": {
        "zh-CN": "音乐",
        "en": "Music"
      }
    }
  ],
  "developer": [
    {
      "id": "project",
      "icon": "folder",
      "label": {
        "zh-CN": "项目",
        "en": "Project"
      }
    },
    {
      "id": "editor",
      "icon": "code",
      "label": {
        "zh-CN": "编辑器",
        "en": "Editor"
      }
    },
    {
      "id": "terminal",
      "icon": "terminal",
      "label": {
        "zh-CN": "终端",
        "en": "Terminal"
      }
    },
    {
      "id": "windows",
      "icon": "monitor",
      "label": {
        "zh-CN": "窗口",
        "en": "Windows"
      }
    },
    {
      "id": "search",
      "icon": "search",
      "label": {
        "zh-CN": "搜索",
        "en": "Search"
      }
    },
    {
      "id": "docs",
      "icon": "book",
      "label": {
        "zh-CN": "文档",
        "en": "Docs"
      }
    },
    {
      "id": "browser",
      "icon": "globe",
      "label": {
        "zh-CN": "浏览器",
        "en": "Browser"
      }
    },
    {
      "id": "settings",
      "icon": "settings",
      "label": {
        "zh-CN": "设置",
        "en": "Settings"
      }
    }
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
