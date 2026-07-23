/**
 * Catalog of argument forms available for dynamic move suggestion.
 * Each form has an id, display name, short description, and 1-2 fill-in-the-blank templates.
 */

export const ARGUMENT_FORMS = [
  {
    id: 'counterexample',
    name: 'Counterexample',
    desc: 'Present a concrete case that challenges their claim',
    templates: [
      'Consider this case: [describe scenario]. Your position implies [consequence], but surely that is wrong because [reason].',
      'Your principle fails in cases like [example]. If we accept your view, then we must also accept [absurd result].',
    ],
  },
  {
    id: 'reductio',
    name: 'Reductio',
    desc: 'Accept their premise, show it leads to absurd conclusions',
    templates: [
      'Let us grant your premise that [premise]. But then it follows that [consequence]. Since that is unacceptable, your premise must be false.',
      'If your argument is sound, then by the same logic we must accept [parallel case]. But no one would accept that.',
    ],
  },
  {
    id: 'socratic_questioning',
    name: 'Socratic Q.',
    desc: 'Force them to confront an internal tension through questioning',
    templates: [
      'You say [claim A], but you also hold [claim B]. How do you reconcile these?',
      'What exactly do you mean by [key term]? Do you mean [interpretation 1] or [interpretation 2]?',
    ],
  },
  {
    id: 'framework_shift',
    name: 'Frmwk Shift',
    desc: 'Critique from a different philosophical tradition',
    templates: [
      'From a [tradition] perspective, your position overlooks [key consideration].',
      'Your argument assumes [framework assumption]. But if we adopt [different framework], we see [alternative conclusion].',
    ],
  },
  {
    id: 'thought_experiment',
    name: 'Thought Exp.',
    desc: 'Construct an imaginative scenario to test their principle',
    templates: [
      'Imagine a world where [scenario]. Under your view, we would have to say [implication]. Does that seem right?',
      'Suppose [hypothetical]. Your position commits you to [consequence], which reveals [problem].',
    ],
  },
  {
    id: 'modus_tollens',
    name: 'Modus Tollens',
    desc: 'Deny the consequent to undermine the antecedent',
    templates: [
      'If your claim is true, then [consequence] must follow. But [consequence] is clearly false. Therefore your claim is false.',
    ],
  },
  {
    id: 'argument_by_analogy',
    name: 'Analogy',
    desc: 'Show your case is structurally similar to a more obvious one',
    templates: [
      'Your case is structurally similar to [analogous situation]. In that case we would say [judgment]. So here too we should conclude [conclusion].',
      'Just as [analogy], so too [application to their argument].',
    ],
  },
  {
    id: 'dilemma',
    name: 'Dilemma',
    desc: 'Present two exhaustive options, both problematic for them',
    templates: [
      'Either [option A] or [option B]. If [option A], then [problem]. If [option B], then [other problem]. Either way, your position fails.',
    ],
  },
  {
    id: 'inference_to_best_explanation',
    name: 'Best Expl.',
    desc: 'Argue that an alternative explanation fits the evidence better',
    templates: [
      'Your account of [phenomenon] is plausible, but [alternative explanation] better explains [evidence] because [reason].',
    ],
  },
  {
    id: 'conceptual_analysis',
    name: 'Concept Analysis',
    desc: 'Examine a key concept they rely on to reveal hidden assumptions',
    templates: [
      'Your argument depends on [concept]. But a careful analysis of [concept] reveals [hidden assumption or ambiguity], which undermines your conclusion.',
    ],
  },
  {
    id: 'empirical_appeal',
    name: 'Empirical Appeal',
    desc: 'Challenge their position with empirical evidence or findings',
    templates: [
      'Your claim that [claim] is contradicted by [empirical evidence]. The evidence suggests instead that [alternative].',
    ],
  },
  {
    id: 'genealogical_critique',
    name: 'Genealogy',
    desc: 'Trace the historical or psychological origins of their view to undermine it',
    templates: [
      'Your position reflects [historical/cultural assumption] rather than a universal truth. When we trace its origins, we find [contingent factor].',
    ],
  },
  {
    id: 'debunking_argument',
    name: 'Debunking',
    desc: 'Show their intuition has an unreliable source',
    templates: [
      'The intuition driving your argument can be explained by [psychological/evolutionary factor], which gives us reason to doubt it tracks truth.',
    ],
  },
  {
    id: 'constructive_proposal',
    name: 'Proposal',
    desc: 'Offer a positive alternative that avoids their problems',
    templates: [
      'Instead of [their view], consider [alternative view]. This avoids [problem with their view] while preserving [what they got right].',
    ],
  },
  {
    id: 'open_question',
    name: 'Open Question',
    desc: 'Ask a question that reveals a gap in their reasoning (Moore-style)',
    templates: [
      'Even granting that [their definition], it remains an open question whether [further claim]. This shows [concept] cannot simply be reduced to [their analysis].',
    ],
  },
  {
    id: 'case_narrative',
    name: 'Case Narrative',
    desc: 'Tell a vivid story or real-world case that challenges their abstract principle',
    templates: [
      'Consider the case of [real or fictional scenario in detail]. This challenges your view because [reason].',
    ],
  },
];

export default ARGUMENT_FORMS;
