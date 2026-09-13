import { anonymousClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { recoveryCode } from "./recovery";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    anonymousClient(),
    {
      id: "recovery-code",
      $InferServerPlugin: {} as ReturnType<typeof recoveryCode>,
      pathMethods: { "/recovery/generate": "POST", "/recovery/reset": "POST" },
    },
  ],
});
