import { definePlugin } from "@oxlint/plugins";
import { rules } from "./rules.js";

export default definePlugin({
  meta: { name: "effect" },
  rules,
});
