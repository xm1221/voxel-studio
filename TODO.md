# TODO

还没做。下面这些不要当成已经上线的功能。

Not shipped. Do not describe these as part of the current product.

- 导出 MP4。现在只有 PNG 和 GIF。
  - MP4 export. PNG and GIF are what ship today.
- 自定义模型文件和完整的 Minecraft 实体库。舞台上现在能放内置方块、几件物品，以及苦力怕、猪、鸡、史莱姆。
  - Custom model files and the full Minecraft entity library. The stage can place built-in blocks, a few items, and a creeper, pig, chicken, and slime.
- 披风高度滑块。现在只有披风开/关，没有高度。
  - Cape height slider. Capes can be shown or hidden, and that is all.
- 舞台拖拽移动再打磨一遍。已有「移动角色」，但还没逐项核对：只改左右和前后（高度仍是滑块）、没有网格吸附、一次只能拖当前这个人。
  - Stage drag-to-move polish. Move mode exists, and still needs a pass: it changes X/Z only (height stays on the slider), there is no grid snap, and only the active player can be dragged.
- 多人站位还没收尾。每人有自己的位置和缩放，但场景会按序号再把人排开，所以「归位」到 `(0,0,0)` 看起来并不会叠在同一个点上。拖拽也不改高度。
  - Multiplayer transform leftovers. Each player has a position and scale, but the stage also spreads them by index, so resetting to `(0,0,0)` does not stack everyone on one point. Dragging does not change height.
