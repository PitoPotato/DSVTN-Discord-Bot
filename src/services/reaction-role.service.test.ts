import { ReactionRoleAction, ReactionRoleStyle } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildPanelMessage, noneToNull, parseColor, type PanelWithItems } from "./reaction-role.service.js";

function panel(style: ReactionRoleStyle, items = 2): PanelWithItems {
  return {
    id: "panel_1",
    guildId: "guild_1",
    name: "test",
    style,
    action: ReactionRoleAction.TOGGLE,
    maxSelections: 2,
    title: "Chọn role",
    description: "Bạn có thể chọn role.",
    color: 0x3498db,
    footer: "DSVTN",
    imageUrl: null,
    thumbnailUrl: null,
    channelId: null,
    messageId: null,
    isEnabled: true,
    createdBy: "user_1",
    createdAt: new Date(),
    updatedAt: new Date(),
    fields: [
      {
        id: "field_1",
        panelId: "panel_1",
        name: "Lưu ý",
        value: "Chọn role phù hợp.",
        inline: false,
        position: 0,
        createdAt: new Date(),
      },
    ],
    items: Array.from({ length: items }, (_, index) => ({
      id: `item_${index + 1}`,
      panelId: "panel_1",
      roleId: `role_${index + 1}`,
      label: `Role ${index + 1}`,
      emoji: index === 0 ? "📣" : null,
      description: `Mô tả ${index + 1}`,
      position: index,
      createdAt: new Date(),
    })),
  };
}

describe("reaction role renderer", () => {
  it("renders a menu with the configured maximum selections", () => {
    const payload = buildPanelMessage(panel(ReactionRoleStyle.MENU));
    const row = payload.components[0].toJSON();
    expect(payload.embeds[0].data.title).toBe("Chọn role");
    expect(payload.embeds[0].data.fields).toEqual([{ name: "Lưu ý", value: "Chọn role phù hợp.", inline: false }]);
    expect(row.components[0]).toMatchObject({ type: 3, max_values: 2, min_values: 1 });
  });

  it("renders button rows with no more than five buttons per row", () => {
    const payload = buildPanelMessage(panel(ReactionRoleStyle.BUTTON, 6));
    expect(payload.components).toHaveLength(2);
    expect(payload.components[0].toJSON().components).toHaveLength(5);
    expect(payload.components[1].toJSON().components).toHaveLength(1);
  });

  it("parses and clears embed fields predictably", () => {
    expect(parseColor("#3498DB")).toBe(0x3498db);
    expect(noneToNull("none")).toBeNull();
    expect(noneToNull(" Footer ")).toBe("Footer");
    expect(() => parseColor("blue")).toThrow();
  });
});
