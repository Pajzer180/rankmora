import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  increment,
} from 'firebase/firestore';
import { writeChangeHistory } from '@/lib/changeHistory';
import { getClientDb } from '@/lib/firebase';
import {
  assertProjectOwnedByUser,
  requireAuthenticatedUid,
  RouteError,
  toRouteErrorResponse,
} from '@/lib/server/firebaseAuth';
import {
  generateRequestSchema,
  generateSeoActionSchema,
  type GenerateSeoAction,
} from '@/lib/server/schemas/generate';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import {
  parseJsonStringWithSchema,
  readJsonRequestBody,
} from '@/lib/server/validation';
import type { ActionType } from '@/types/history';

function inferActionType(action: GenerateSeoAction): ActionType {
  const text = `${action.action} ${action.selector}`.toLowerCase();
  if (text.includes('meta') && text.includes('description')) return 'update_meta_description';
  if (text.includes('title')) return 'update_title';
  if (text.includes('h1')) return 'update_h1';
  if (text.includes('h2')) return 'update_h2';
  if (text.includes('canonical')) return 'update_canonical';
  if (text.includes('robots')) return 'update_robots';
  if (action.type === 'replace_text') return 'update_content';
  return 'update_other';
}

const SYSTEM_PROMPT = `Jestes Inzynierem SEO. Na podstawie instrukcji uzytkownika wygeneruj JSON dla skryptu JS Snippet. Format odpowiedzi to WYLACZNIE poprawny JSON o strukturze: { action: string, selector: string, value: string, type: 'replace_text' | 'replace_meta' | 'add_class' }. Nie dodawaj zadnych znacznikow markdown (jak \`\`\`json) ani komentarzy.`;

export async function POST(req: Request) {
  try {
    const uid = await requireAuthenticatedUid(req);
    const rateLimitResponse = enforceRateLimit(req, { scope: 'generate', uid });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const {
      instruction,
      clientId,
      projectId,
      siteUrl,
      pageUrl,
      source,
      entityType,
      entityId,
    } = await readJsonRequestBody(req, generateRequestSchema);

    if (projectId) {
      await assertProjectOwnedByUser(uid, projectId);
    }

    const requestId = crypto.randomUUID();

    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: SYSTEM_PROMPT,
      prompt: instruction,
    });

    let parsed: GenerateSeoAction;
    try {
      parsed = parseJsonStringWithSchema(text, generateSeoActionSchema, {
        code: 'MODEL_OUTPUT_INVALID',
        message: 'Agent zwrocil nieprawidlowy JSON',
        status: 500,
        target: 'model_output',
      });
    } catch (error) {
      console.error('[generate] Blad walidacji JSON z Claude:', error);
      console.error('[generate] Surowa odpowiedz modelu:', text);
      throw error instanceof RouteError
        ? error
        : new RouteError(500, 'Agent zwrocil nieprawidlowy JSON', {
            code: 'MODEL_OUTPUT_INVALID',
            target: 'model_output',
          });
    }

    const db = getClientDb();
    const actionRef = await addDoc(collection(db, 'seo_actions'), {
      clientId,
      actionData: parsed,
      status: 'active',
      createdAt: serverTimestamp(),
      projectId: projectId ?? null,
      userId: uid,
      siteUrl: siteUrl ?? null,
      pageUrl: pageUrl ?? null,
      requestId,
    });

    if (projectId && siteUrl && pageUrl) {
      await writeChangeHistory({
        projectId,
        userId: uid,
        siteUrl,
        pageUrl,
        actionType: inferActionType(parsed),
        source,
        status: 'preview',
        beforeValue: '',
        afterValue: parsed.value ?? '',
        summary: parsed.action || 'SEO action preview',
        entityType,
        entityId,
        actionId: actionRef.id,
        requestId,
      });
    }

    try {
      await setDoc(
        doc(db, 'clients', clientId),
        { credits: increment(-10) },
        { merge: true },
      );
    } catch (creditsErr) {
      console.error('[generate] Blad aktualizacji kredytow (cichy):', creditsErr);
    }

    return NextResponse.json({
      ...parsed,
      actionId: actionRef.id,
      requestId,
    });
  } catch (error) {
    console.error('[generate] Nieobsluzony blad:', error);
    return toRouteErrorResponse(error);
  }
}
