# TODO

还没做。下面这些不要当成已经上线的功能。

Not shipped. Do not describe these as part of the current product.

- 自定义关键帧动画的 JSON 导入 / 导出。现有的「我的姿势」只保存一帧关节，不是时间轴。
  - Custom keyframe animation JSON import/export. Saved poses are a single joint frame, not a timeline.
- 导出 MP4。现在只有 PNG 和 GIF。
  - MP4 export. PNG and GIF are what ship today.
- 把 Minecraft 物品、方块、实体当作道具放进场景。
  - Minecraft items, blocks, and entities as scene props.
- 披风高度滑块。现在只有披风开/关，没有高度。
  - Cape height slider. Capes can be shown or hidden, and that is all.
- 舞台拖拽移动再打磨一遍。已有「移动角色」，但还没逐项核对：只改左右和前后（高度仍是滑块）、没有网格吸附、一次只能拖当前这个人。
  - Stage drag-to-move polish. Move mode exists, and still needs a pass: it changes X/Z only (height stays on the slider), there is no grid snap, and only the active player can be dragged.
- 多人站位还没收尾。每人有自己的位置和缩放，但场景会按序号再把人排开，所以「归位」到 `(0,0,0)` 看起来并不会叠在同一个点上。拖拽也不改高度。
  - Multiplayer transform leftovers. Each player has a position and scale, but the stage also spreads them by index, so resetting to `(0,0,0)` does not stack everyone on one point. Dragging does not change height.
