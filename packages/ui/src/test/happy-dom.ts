// Registers happy-dom's DOM globals (`document`, `window`, ...) on the Bun test
// runner. Import this module before `@testing-library/react` in DOM tests so
// the testing library sees a browser-like environment at module load time.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
