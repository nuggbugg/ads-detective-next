import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isLoginPage = createRouteMatcher(["/login"]);
const isPublicRoute = createRouteMatcher(["/login", "/_next(.*)", "/favicon.ico"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    // If authenticated and visiting login → redirect to dashboard
    if (isLoginPage(request) && (await convexAuth.isAuthenticated())) {
      return nextjsMiddlewareRedirect(request, "/dashboard");
    }
    // If unauthenticated and visiting a protected route → redirect to login
    if (!isPublicRoute(request) && !(await convexAuth.isAuthenticated())) {
      return nextjsMiddlewareRedirect(request, "/login");
    }
  }
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
