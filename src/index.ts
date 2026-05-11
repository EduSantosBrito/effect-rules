import { definePlugin } from "@oxlint/plugins";
import { rules } from "./rules";

export default definePlugin({
  meta: { name: "effect" },
  rules,
});
