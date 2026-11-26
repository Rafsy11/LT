import { AiAssistantView } from '@/features/ai';
import { ollamaClient } from '@/server/lib/ollama';

export const dynamic = 'force-dynamic';

export default function AiPage() {
  const configuredModel = ollamaClient.getActiveModel();
  return <AiAssistantView initialModel={configuredModel} />;
}
