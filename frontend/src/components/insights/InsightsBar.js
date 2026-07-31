import React from 'react';

import { useInsightsBadges } from '../../hooks/useInsightsBadges';

const LEVEL_LABELS = {
  critical: 'Критично',
  high: 'Важно',
  medium: 'Смотреть',
  low: 'Спокойно'
};

const LEVEL_EMOJIS = {
  critical: '😱',
  high: '😮',
  medium: '😐',
  low: '😊'
};

const buildSoftBackground = (hex) => {
  if (!hex) return 'rgba(255, 255, 255, 0.08)';
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    return `#${clean}20`;
  }
  return hex;
};

const InsightsBar = () => {
  const { badges, loading, error } = useInsightsBadges();
  const hasBadges = badges && badges.length > 0;

  const renderBadges = hasBadges
    ? badges
    : [
        {
          id: 'no-alerts',
          title: 'Сигналов пока нет',
          description: 'Система не зафиксировала критичных отклонений.',
          level: 'low',
          color: '#22c55e'
        }
      ];

  return null;
};

export default InsightsBar;
