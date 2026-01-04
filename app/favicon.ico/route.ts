import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    // Serve the SVG icon as favicon
    const iconPath = join(process.cwd(), 'app', 'icon.svg');
    const iconContent = await readFile(iconPath, 'utf-8');
    
    return new NextResponse(iconContent, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    // Fallback: return a simple SVG
    const fallbackSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8A2BE2"/><circle cx="50" cy="50" r="30" fill="#FFFFFF" opacity="0.9"/><path d="M 35 50 L 45 60 L 65 40" stroke="#8A2BE2" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return new NextResponse(fallbackSvg, {
      headers: {
        'Content-Type': 'image/svg+xml',
      },
    });
  }
}

