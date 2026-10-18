import { Button, Icon } from '@nexus-ai/ui';
import { navigate } from '../routes.js';
import { useOnboarding } from './OnboardingProvider.js';
import './onboarding.css';

export function OnboardingSummary() {
  const guide = useOnboarding();
  if (guide.completed) return null;
  const steps = guide.steps.filter(step => guide.mode === 'developer' || ['account', 'workspace', 'project'].includes(step.id));
  const next = steps.find(step => !step.complete && step.available) ?? steps.find(step => !step.complete);
  return <section className="onboarding-summary" data-testid="onboarding-summary" aria-label="Getting started"><span className="onboarding-stage-icon"><Icon name="sparkles" size={22} /></span><div><span className="domain-eyebrow">GETTING STARTED · {steps.filter(step => step.complete).length} / {steps.length}</span><h2>{guide.mode === 'developer' ? 'Your first AI session starts here' : 'Find your shared project'}</h2><p>{next ? `Next: ${next.title}. ${next.description}` : 'Reopen the guide to check your setup.'}</p></div><Button size="sm" variant="primary" onClick={() => { guide.restart(); navigate('getting-started'); }}>Continue setup<Icon name="arrow-right" size={14} /></Button></section>;
}
