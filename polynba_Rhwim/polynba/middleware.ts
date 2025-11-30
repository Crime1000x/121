// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 1. 放行逻辑：如果用户访问的是登录页、API、Next.js 系统文件或静态资源，直接放行
  if (
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/api') || // 放行所有 API 路由 (包括 webhook 和 poll)
    request.nextUrl.pathname.startsWith('/_next') || 
    request.nextUrl.pathname.includes('.') // 放行静态资源 (如 .png, .ico, .css 等)
  ) {
    return NextResponse.next();
  }

  // 2. 检查是否有 auth_session Cookie
  const authCookie = request.cookies.get('auth_session');

  // 3. 如果没有 Cookie，重定向到登录页，并带上 returnUrl
  if (!authCookie) {
    const loginUrl = new URL('/login', request.url);
    
    // 关键步骤：记录用户原本想访问的完整路径（包含查询参数）
    // 例如用户访问 /market/123?tab=stats，登录后应该跳回这里，而不是首页
    loginUrl.searchParams.set('returnUrl', request.nextUrl.pathname + request.nextUrl.search);
    
    return NextResponse.redirect(loginUrl);
  }

  // 4. 验证通过，放行
  return NextResponse.next();
}

// 配置中间件匹配规则
export const config = {
  // 匹配所有路径，除了 api 开头的、_next 静态资源、以及 favicon.ico
  // 注意：这里的 api 排除是为了双重保险，虽然上面代码里已经处理了
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};