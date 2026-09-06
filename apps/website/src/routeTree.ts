import type {} from "@tanstack/react-start";
import { Route as rootRouteImport } from "./routes/__root.tsx";
import { Route as ApiSplatRouteImport } from "./routes/api.$.ts";
import { Route as IndexRouteImport } from "./routes/index.tsx";

const noPendingRouteComponent = () => null;

const indexRouteOptions = {
  id: "/",
  path: "/",
  getParentRoute: () => rootRouteImport,
  pendingComponent: noPendingRouteComponent,
};

const apiSplatRouteOptions = {
  id: "/api/$",
  path: "/api/$",
  getParentRoute: () => rootRouteImport,
  pendingComponent: noPendingRouteComponent,
};

const IndexRoute = IndexRouteImport.update(indexRouteOptions);
const ApiSplatRoute = ApiSplatRouteImport.update(apiSplatRouteOptions);

interface FileRoutesByFullPath {
  readonly "/": typeof IndexRoute;
  readonly "/api/$": typeof ApiSplatRoute;
}

interface FileRoutesByTo {
  readonly "/": typeof IndexRoute;
  readonly "/api/$": typeof ApiSplatRoute;
}

interface FileRoutesById {
  readonly __root__: typeof rootRouteImport;
  readonly "/": typeof IndexRoute;
  readonly "/api/$": typeof ApiSplatRoute;
}

interface FileRouteTypes {
  readonly fileRoutesByFullPath: FileRoutesByFullPath;
  readonly fullPaths: "/" | "/api/$";
  readonly fileRoutesByTo: FileRoutesByTo;
  readonly to: "/" | "/api/$";
  readonly id: "__root__" | "/" | "/api/$";
  readonly fileRoutesById: FileRoutesById;
}

interface RootRouteChildren {
  readonly IndexRoute: typeof IndexRoute;
  readonly ApiSplatRoute: typeof ApiSplatRoute;
}

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    readonly "/": {
      readonly id: "/";
      readonly path: "/";
      readonly fullPath: "/";
      readonly preLoaderRoute: typeof IndexRouteImport;
      readonly parentRoute: typeof rootRouteImport;
    };
    readonly "/api/$": {
      readonly id: "/api/$";
      readonly path: "/api/$";
      readonly fullPath: "/api/$";
      readonly preLoaderRoute: typeof ApiSplatRouteImport;
      readonly parentRoute: typeof rootRouteImport;
    };
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute,
  ApiSplatRoute,
};

/** Strictly typed application route tree without generated type assertions. */
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>();

import type { getRouter } from "./router.tsx";
import type { startInstance } from "./start.ts";

declare module "@tanstack/react-start" {
  interface Register {
    ssr: true;
    config: typeof startInstance;
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
