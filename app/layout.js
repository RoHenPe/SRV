import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'ROHENPER — Server Dashboard',
  description: 'Dashboard de gerenciamento do servidor remoto ROHENPER. Controle energia, Docker, backups, IA Hub e mais.',
  keywords: 'servidor, dashboard, docker, ollama, backup, SSH',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
