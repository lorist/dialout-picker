// src/main.js
import { registerPlugin } from "@pexip/plugin-api";

(async () => {
    const plugin = await registerPlugin({
        id: "dialout-picker",
        version: 1,
    });

    const widget = await plugin.ui.addWidget({
        type: "floating",
        src: "./plugins/dialout-picker/widget.html",
        title: "Dial out",        // ✅ keep native widget header (X + drag dots)
        draggable: true,
        isVisible: false,
        position: "topRight",
        dimensions: { width: "620px", height: "460px" }, // ✅ gives room for sticky footer
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
