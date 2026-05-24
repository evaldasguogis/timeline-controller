import React from 'react';
import { StandardEditorProps } from '@grafana/data';
import { Card } from '@grafana/ui';
import { Mode } from '../types';

// Editor for `mode`. Each mode is a Card showing label + summary; clicking
// a card selects that mode. We use Grafana's first-class Card with
// isSelected/onClick (same primitive core Grafana uses for its
// visualization picker) — a horizontal RadioButtonGroup couldn't fit three
// readable labels in the panel-options sidebar. As new modes ship, add
// them to MODES — no other change needed.

interface ModeDescriptor {
  value: Mode;
  label: string;
  // One short line, two clauses separated by an em-dash:
  //   [what it does] — [what it costs / requires]
  // Keeps every mode comparable at a glance.
  summary: string;
}

const MODES: ModeDescriptor[] = [
  {
    value: 'basic',
    label: 'Basic',
    summary:
      'Drives the dashboard\'s global time range — zero setup, works on any dashboard.',
  },
  {
    value: 'sliding',
    label: 'Sliding Window',
    summary:
      'Writes template variables that other panels reference in their queries — requires preparing the dashboard.',
  },
  {
    value: 'event',
    label: 'Event Replay',
    summary:
      'Writes template variables across a panel-saved time range — useful for replaying a specific historical event regardless of the dashboard\'s current view.',
  },
];

export const ModeEditor: React.FC<StandardEditorProps<Mode>> = ({ value, onChange }) => (
  <div role="radiogroup" aria-label="Mode">
    {MODES.map((m) => (
      <Card
        key={m.value}
        isCompact
        isSelected={value === m.value}
        onClick={() => onChange(m.value)}
      >
        <Card.Heading aria-label={m.label}>{m.label}</Card.Heading>
        <Card.Description>{m.summary}</Card.Description>
      </Card>
    ))}
  </div>
);
