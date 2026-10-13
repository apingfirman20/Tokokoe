'use client';

import React from 'react';
import * as Icons from 'lucide-react';

interface DynamicIconProps {
  name: string;
  className?: string;
}

export function DynamicIcon({ name, className = 'w-5 h-5' }: DynamicIconProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (Icons as any)[name] || Icons.CircleDot;
  return <IconComponent className={className} />;
}
