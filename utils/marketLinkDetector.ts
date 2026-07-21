// Market link detection and extraction utilities

export interface MarketLinkInfo {
  marketId: string;
  url: string;
  startIndex: number;
  endIndex: number;
}

// Detect market links in text
export const detectMarketLinks = (text: string): MarketLinkInfo[] => {
  const links: MarketLinkInfo[] = [];
  
  // Pattern 1: Full URLs (http://localhost:3001/market/123)
  const fullUrlRegex = /https?:\/\/[^\s]+\/market\/([a-zA-Z0-9_-]+)/g;
  let match;
  
  while ((match = fullUrlRegex.exec(text)) !== null) {
    links.push({
      marketId: match[1],
      url: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  
  // Pattern 2: Relative URLs (/market/123)
  const relativeUrlRegex = /\/market\/([a-zA-Z0-9_-]+)/g;
  while ((match = relativeUrlRegex.exec(text)) !== null) {
    // Skip if already matched by full URL
    const alreadyMatched = links.some(
      link => link.startIndex <= match!.index && match!.index < link.endIndex
    );
    
    if (!alreadyMatched) {
      links.push({
        marketId: match[1],
        url: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }
  
  return links;
};

// Extract text parts (text segments and market links)
export interface TextPart {
  type: 'text' | 'market-link';
  content: string;
  marketId?: string;
}

export const parseTextWithMarketLinks = (text: string): TextPart[] => {
  const links = detectMarketLinks(text);
  
  if (links.length === 0) {
    return [{ type: 'text', content: text }];
  }
  
  const parts: TextPart[] = [];
  let lastIndex = 0;
  
  // Sort links by start index
  links.sort((a, b) => a.startIndex - b.startIndex);
  
  for (const link of links) {
    // Add text before link
    if (link.startIndex > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, link.startIndex),
      });
    }
    
    // Add market link
    parts.push({
      type: 'market-link',
      content: link.url,
      marketId: link.marketId,
    });
    
    lastIndex = link.endIndex;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }
  
  return parts;
};

// Validate market ID format
export const isValidMarketId = (marketId: string): boolean => {
  return /^[a-zA-Z0-9_-]+$/.test(marketId);
};
