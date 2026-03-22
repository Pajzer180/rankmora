import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getClientDb } from '@/lib/firebase';

// LEGACY — endpoint serwujący akcje SEO dla JS snippetu. Nowy core nie używa snippetu.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

  if (!clientId) {
    return NextResponse.json(
      { error: 'Brak parametru clientId' },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const db = getClientDb();

  // Pobieramy dokumenty dla danego clientId i filtrujemy status w JS
  // (unikamy konieczności tworzenia composite index w Firestore)
  const q = query(
    collection(db, 'seo_actions'),
    where('clientId', '==', clientId),
  );

  const snapshot = await getDocs(q);

  const actions = snapshot.docs
    .map((d) => d.data())
    .filter((d) => d.status === 'active')
    .map((d) => d.actionData);

  return NextResponse.json(actions, { headers: CORS_HEADERS });
}
