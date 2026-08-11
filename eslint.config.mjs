import { vue } from '@personal-os/config/eslint';

// 根级 flat config：供 lint-staged（根 cwd）与仓库级检查使用。
// 各子包仍使用自己的 eslint.config.mjs（按包裁剪规则）。
export default [...vue];
