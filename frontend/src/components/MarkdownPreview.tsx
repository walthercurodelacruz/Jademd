import React from 'react';
import { LiveView } from './LiveView';

export const MarkdownPreview = (props: React.ComponentProps<typeof LiveView>) => <LiveView {...props} readOnly />;
