'use client';

import React from 'react';
import { useAiAssistant } from '../hooks/use-ai-assistant';
import { AiHero } from './ai-hero';
import { AiMessageList } from './ai-message-list';
import { AiPromptInput } from './ai-prompt-input';
import '@/styles/features/ai-page.css';

export interface AiAssistantViewProps {
  initialModel?: string;
}

export function AiAssistantView({ initialModel }: AiAssistantViewProps) {
  const {
    prompt,
    setPrompt,
    attachment,
    handleAttachFile,
    handleRemoveAttachment,
    loading,
    activeModel,
    messages,
    messagesEndRef,
    suggestions,
    sendMessage,
    handleClearChat,
    formatPayloadEntry,
  } = useAiAssistant(initialModel);

  return (
    <main
      id="main-content"
      className="ai-assistant-page"
      aria-label="Ruang Kerja AI Assistant"
    >
      {messages.length > 0 && <h1 className="sr-only">AI Assistant FiberOps</h1>}
      {!messages.length ? (
        <AiHero suggestions={suggestions} onSelectSuggestion={(text) => sendMessage(text)} />
      ) : (
        <AiMessageList
          messages={messages}
          loading={loading}
          activeModel={activeModel}
          onClearChat={handleClearChat}
          formatPayloadEntry={formatPayloadEntry}
          messagesEndRef={messagesEndRef}
        />
      )}

      <div className="ai-prompt-input-container">
        <AiPromptInput
          prompt={prompt}
          setPrompt={setPrompt}
          attachment={attachment}
          onSelectFile={handleAttachFile}
          onRemoveAttachment={handleRemoveAttachment}
          loading={loading}
          onSubmit={(text) => sendMessage(text)}
        />
      </div>
    </main>
  );
}
