// src/main.js
import { registerPlugin } from "@pexip/plugin-api";

(async () => {
    const plugin = await registerPlugin({
        id: "dialout-picker",
        version: 1,
    });

    // Floating widget that contains the searchable "dropdown"
    // NOTE: widget src is relative to the plugin root (same as index.html)
    const widget = await plugin.ui.addWidget({
        type: "floating",
        src: "./plugins/dialout-picker/widget.html",
        title: "Dial out",
        draggable: true,
        isVisible: false,
        position: "topRight",
        dimensions: { width: "420px", height: "520px" },
    });

    const btn = await plugin.ui.addButton({
        position: "toolbar",
        icon: "IconPhone",
        tooltip: "Dial out",
        roles: ["chair"],
    });

    btn.onClick.add(() => {
        void widget.toggle();
    });
})();
