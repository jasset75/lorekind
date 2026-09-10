import { createRuntimeFixture } from "./runtime-fixture";

let handle = createRuntimeFixture();
export default {
  async fetch(request: Request) {
    if (new URL(request.url).pathname === "/__fixture/reset") {
      handle = createRuntimeFixture();
      return new Response("ok");
    }
    if (new URL(request.url).pathname === "/__fixture/runtime") {
      let dynamicCodeBlocked = false;
      try {
        new Function("return 1")();
      } catch {
        dynamicCodeBlocked = true;
      }
      return Response.json({ dynamicCodeBlocked, nodeProcessAbsent: !("process" in globalThis) });
    }
    return handle(request);
  },
};
