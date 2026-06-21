import { NextResponse } from 'next/server';

export function middleware(request) {
  const path = request.nextUrl.pathname;

  // Rotas públicas que não precisam de auth
  const publicRoutes = ['/', '/login', '/api/auth/validate'];

  if (publicRoutes.includes(path)) {
    return NextResponse.next();
  }

  // Se não tiver token no localStorage (não conseguimos ver do lado do servidor)
  // Redireciona para login - mas o frontend vai fazer esse check
  // Este middleware é mais para segurança de camadas
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
