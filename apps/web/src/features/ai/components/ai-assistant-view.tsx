'use client';

import React from 'react';
import { useAiAssistant } from '../hooks/use-ai-assistant';
import { AiHero } from './ai-hero';
import { AiMessageList } from './ai-message-list';
import { AiPromptInput } from './ai-prompt-input';

export function AiAssistantView() {
  const {
    prompt,
    setPrompt,
    loading,
    messages,
    messagesEndRef,
    suggestions,
    sendMessage,
    handleClearChat,
    formatPayloadEntry,
  } = useAiAssistant();

  return (
    <section
      className="ai-assistant-page"
      aria-label="Ruang Kerja AI Assistant"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 'calc(100vh - 125px)',
        width: '100%',
        padding: '36px 24px 32px 24px',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {!messages.length ? (
        <AiHero suggestions={suggestions} onSelectSuggestion={(text) => sendMessage(text)} />
      ) : (
        <AiMessageList
          messages={messages}
          loading={loading}
          onClearChat={handleClearChat}
          formatPayloadEntry={formatPayloadEntry}
          messagesEndRef={messagesEndRef}
        />
      )}

      <AiPromptInput
        prompt={prompt}
        setPrompt={setPrompt}
        loading={loading}
        onSubmit={(text) => sendMessage(text)}
      />
    </section>
  );
}
