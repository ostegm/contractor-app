// Define custom page props for Next.js pages
import { ReactNode } from 'react';

declare module 'next' {
  export interface PageProps {
    children?: ReactNode;
    params?: { [key: string]: string | string[] };
    searchParams?: { [key: string]: string | string[] | undefined };
  }
}