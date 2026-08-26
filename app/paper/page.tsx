import type { Metadata } from "next";
import { Download, FileText } from "lucide-react";
import { DataTable } from "./DataTable";
import {
  ASYMMETRY_TABLE,
  CHANGES_TABLE,
  HEADLINE_TABLE,
  IRR_TABLE,
  LOSS_PATTERN_TABLE,
  PAPER_BYLINE,
  PAPER_PDF_HREF,
  PAPER_TITLE,
  SECTIONS,
  STABILITY_TABLE,
  TRANSCRIPTION_NOTES,
} from "./paperContent";

export const metadata: Metadata = {
  title: "Results, Methods, and Deviations — CRAFT Benchmark",
  description:
    "The study report: what changed from the proposal and why, what was retained, and the full results.",
};

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-6 text-2xl font-display font-bold text-text-heading pt-4 border-t border-cream-border"
    >
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-base leading-relaxed text-text-body">{children}</p>;
}

export default function PaperPage() {
  return (
    <article className="max-w-3xl space-y-6 pb-16">
      {/* Masthead */}
      <header className="space-y-4">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          <FileText size={14} />
          Study report
        </p>
        <h1 className="text-4xl font-display font-bold text-text-heading">{PAPER_TITLE}</h1>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-muted">
          {PAPER_BYLINE.map((b) => (
            <p key={b.role}>
              <span className="text-text-muted">{b.role} — </span>
              <span className="font-medium text-text-body">{b.name}</span>
            </p>
          ))}
        </div>
        <a
          href={PAPER_PDF_HREF}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-white hover:bg-navy-900"
        >
          <Download size={16} />
          Download PDF
        </a>
      </header>

      {/* Contents */}
      <nav
        aria-label="Contents"
        className="rounded-lg border border-cream-border bg-cream-card px-4 py-3"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Contents
        </p>
        <ol className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-navy-700 hover:text-navy-900 hover:underline">
                {s.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <H2 id="methods-and-deviations">Methods and Deviations</H2>
      <P>
        This report details differences between the executed study and the original proposal and
        justifies each deviation. All deviations were necessary because commercial model APIs
        changed after the proposal was written. No discretionary changes were made to the research
        design. The report also identifies which design elements remain unchanged, thus confirming
        that the study continues to address its original research question.
      </P>

      <H2 id="summary-of-what-changed">Summary of what changed</H2>
      <DataTable head={CHANGES_TABLE.head} rows={CHANGES_TABLE.rows} mono={false} />

      <H2 id="model-substitutions">Model Substitutions</H2>
      <P>
        Both models specified in the proposal were retired by their providers prior to data
        collection. Anthropic discontinued claude-3-5-sonnet on the API, and gpt-4o, although
        still available, is from 2024. To prevent a significant capability gap and confounding in
        cross-model comparisons, both test models were updated simultaneously. The replacements,
        claude-sonnet-5 and gpt-5.5, are comparable in tier and release date.
      </P>
      <P>
        The evaluator model was also withdrawn. Gemini-1.5-pro is no longer available, and its
        intended replacement, gemini-2.5-pro, is listed by the API but returns a 404 error for new
        users. Access appears restricted to existing keys, and the project&rsquo;s key cannot
        access any Gemini 2.5 model, either Pro or Flash. Among the remaining callable non-preview
        options, all are Flash-tier; therefore, I used a Flash-tier judge instead of a Pro-tier
        judge. This substitution is justified because the scoring task involves comprehension
        against an explicit constraint list rather than advanced reasoning, and because family
        neutrality, the ability of a judge to score outputs from both test models without
        evaluating its own family, is the critical property underpinning the judge design.
        Shifting the primary judge away from Google to maintain tier would have required scoring
        every output with a model from one of the two test families, which would have introduced
        greater bias.
      </P>
      <P>
        Claude Fable 5 and Claude Mythos 5 were both considered and rejected. Mythos is not
        publicly available, since access is by invitation only through Anthropic&rsquo;s Project
        Glasswing. Fable 5 is generally available but ships with safeguards that route a subset of
        queries to Claude Opus 5 instead, which disqualifies it for an evaluator because the model
        that answers is not guaranteed to be the model selected on an unknown and unidentifiable
        subset of calls. A judge whose identity is not knowable per call cannot support the
        reliability claims this design rests on. Both are also Anthropic models, so either would
        have collided with Claude-sonnet-5 under the family-neutrality rule anyway.
      </P>

      <H2 id="decoding-parameters">Decoding Parameters</H2>
      <P>
        The proposal specified a temperature setting of 0.2 for both models to reduce sampling
        variance and enhance representativeness. This configuration is no longer feasible.
        Claude-sonnet-5 does not accept the temperature parameter and instead provides a discrete
        effort control, while gpt-5.5 accepts the temperature parameter but only at the default
        value of 1.0. Consequently, both models operate at their provider defaults, recorded as
        null for Claude and 1.0 for GPT, accurately reflecting their configurations. For OpenAI
        calls, reasoning effort is explicitly set to low to ensure the study record reflects the
        requested setting rather than an unobservable provider default. Claude&rsquo;s effort
        setting remains unset, as the two controls are not directly comparable and equating them
        would imply an unjustified equivalence.
      </P>
      <P>
        This change does not impact the primary comparison between baseline and CRAFT conditions
        within each model. Both conditions within each pair use identical decoding settings,
        enforced by a settings hash that rejects any pair with differing parameters. The
        comparison remains valid because settings are constant within each pair, not because of
        their absolute values. The change increases run-to-run variance, particularly for GPT at
        temperature 1.0, which elevates the stability subset beyond its original role as a
        confirmatory check and makes it the sole empirical measure of variance.
      </P>

      <H2 id="retained-unchanged">What was retained unchanged</H2>
      <P>
        The central question is whether the study still addresses its original research objective,
        which it does. The task set remains unchanged, comprising 50 tasks across six domains:
        eight coding, nine finance, nine policy, nine data analysis, eight education, and seven
        professional communication tasks. The rubric is also unchanged, with scores assigned for
        constraint adherence (0 to 4), logical accuracy (0 to 4), and completeness (0 to 2).
      </P>
      <P>
        The paired within-task design was implemented as specified. Each task was executed under
        both conditions on both models within n=1 per cell, and execution-layer controls ensured
        that unpaired data could not be produced inadvertently. The stability subset was also
        implemented as planned: ten tasks at n=3, selected by seeded stratified random draw with
        quotas weighted toward open-ended domains, frozen prior to any run, and maintained as
        read-only during execution.
      </P>
      <P>
        Blinding procedures were maintained and enhanced. Evaluator payloads include only task
        description, expected constraints, rubric notes, and response text, omitting both model
        names and condition labels. Output identifiers are opaque sequential tokens, with their
        mapping stored externally from all evaluator code paths. The family-collision check
        determines the producing model server-side based on the token, rather than relying on
        client-side reporting.
      </P>
      <P>
        CRAFT prompt construction remains unchanged in principle and has been further standardized
        in practice. Prompts are mechanically assembled from five authored component fields in a
        fixed order, precluding manual authoring or overrides. This approach eliminates the
        researcher&rsquo;s degrees of freedom and ensures that the registry can regenerate every
        prompt in the study. The task stimulus is appended identically to both conditions, in the
        same position and with the same delimiters, as verified across all 50 tasks. Therefore,
        the stimulus does not constitute part of either prompt condition.
      </P>

      <H2 id="what-was-added">What was added</H2>
      <P>
        Two additional elements were incorporated to strengthen the study design beyond what the
        original proposal described.
      </P>
      <P>
        The first is the two-judge architecture. The proposal specified an unbiased LLM judge, and
        the executed design uses two. Gemini-3.7-flash is the primary model for every output in
        the study, and a secondary judge rotates by model, so GPT judges Claude output and Claude
        judges GPT output. No model ever evaluates its own family, and the system enforces this
        server-side as a hard rejection rather than a convention. Headline results use
        primary-judge scores only, and the two judges are never averaged, because averaging would
        collapse their disagreement into a point estimate and destroy the reliability measurement
        that the second judge exists to produce, and because the secondary varies by producing
        model, so averaging would bake GPT-as-judge into the Claude distribution and
        Claude-as-judge into the GPT distribution. Agreement between the two is reported
        separately instead.
      </P>
      <P>
        The second enhancement is provenance capture. Neither Anthropic nor Google provides dated
        snapshot identifiers for the models used, so the identifiers are bare and repointable. To
        address this, timestamped provider manifests were captured before and after each dispatch
        period. Every result includes that of its judge. A drift check compares live provenance
        against the most recent manifest and flags any changes.
      </P>

      <H2 id="known-limitations">Known limitations</H2>
      <P>
        Commercial models are not archival, and two of the three model identifiers cannot be
        linked to a fixed version. As a result, the findings are attributable only to the model
        state observed during the run window, as documented in the captured manifests. This
        limitation arises from the provider ecosystem rather than from the study design.
      </P>
      <P>
        Cross-model comparisons are descriptive only, as the secondary varies depending on the
        producing model and the two models operate under different decoding regimes. The baseline
        versus CRAFT comparison within each model remains unaffected by these factors.
      </P>
      <P>
        Evaluator reliability was limited for the primary judge, although no data was lost as a
        result. Gemini-3.7-flash required retries on 70.9% of its 261 calls and failed outright on
        22.2%, with failures concentrated in identifiable degradation windows. All failures were
        due to 503-exhaustion and were resolved through subsequent evaluation passes, ensuring no
        loss of scores. During the same period, secondary judges recorded a 10.2% retry rate and
        14.4% failure rate for claude-sonnet-5, and zero for both metrics on gpt-5.5. On the
        generation side, across all 320 runs, there were no retries or failures, indicating that
        all operational issues were confined to the judge side.
      </P>
      <P>
        The effect size is small relative to noise. The observed pooled delta of &minus;0.30
        exceeds the mean within-cell run-to-run standard deviation of 0.220 by 1.37, so the
        finding is resolvable only in aggregate. No individual pair&rsquo;s delta is interpretable
        at n=1, and the pooled result holds because 100 paired comparisons average out the noise.
      </P>
      <P>
        Sixteen secondary evaluations required an extended judge output budget of 12,000 tokens
        instead of 4,000 after the judge exhausted its budget on reasoning and produced no text.
        All instances involved Claude-sonnet-5 as the secondary judge on GPT-produced output.
        Since all headline figures are based solely on primary-judge scores and no primary
        evaluation used to a non-standard budget, this issue affects only inter-rater agreement
        figures. It influenced which cells qualified as complete but did not impact any headline
        results.
      </P>
      <P>
        One of the 320 generations reached the output limit. Task T010, using claude-sonnet-5 in
        the baseline condition, hit the 4,000-token cap. This instance was retained rather than
        re-run, as re-running at a higher budget would have introduced different decoding
        parameters from its paired counterpart. Because truncation occurred in the baseline
        condition, it reduced baseline completeness points and introduced a bias in favor of
        CRAFT, representing a conservative direction relative to the reported finding.
      </P>
      <P>
        The constraint-type analysis presented below is exploratory rather than confirmatory. Only
        seven of the 50 tasks include three or more negative constraints, and none include more
        than three; these tasks are also clustered by domain.
      </P>

      <H2 id="ceiling-effect">Ceiling effect</H2>
      <P>
        The baseline condition achieved a score of 9.12 out of 10 when pooled across 100 paired
        cells, with scores of 9.28 for Claude and 8.96 for GPT. Additionally, 54% of all pairs
        tied at 10/10. Under these circumstances, the CRAFT condition has minimal headroom, as it
        only matches or underperforms relative to baseline, with little opportunity for further
        improvement.
      </P>
      <P>
        Difficulty labels did not correspond to judged difficulty. Tasks labeled as Hard outscored
        those labeled as Medium at baseline, with scores of 9.20 versus 9.09, and the ceiling
        effect was consistent across all three tiers. The labels did not reflect the difficulty
        the models experienced. This discrepancy is attributable to the task set being calibrated
        against source material intended for an earlier model generation, but evaluated using 2026
        frontier models that solved the tasks with ease &mdash; a direct consequence of the model
        substitutions. The study was designed for one capability level but executed at another.
        The rubric still registers failures, including cells scoring 3 and below, so the
        instrument retains discriminatory power, but there is little variation to discriminate at
        this task difficulty.
      </P>

      <H2 id="results">Results</H2>
      <P>
        All figures presented below are calculated over paired tasks by model cells, using
        primary-judge scores exclusively. Deltas represent CRAFT minus baseline. Notably, an
        earlier aggregation defect, which grouped results by task alone and computed condition
        means over unequal task sets, had previously favored the CRAFT condition. Correcting this
        defect shifted the observed delta from &minus;0.34 to &minus;0.41, indicating that the
        correction was conservative with respect to CRAFT.
      </P>
      <DataTable head={HEADLINE_TABLE.head} rows={HEADLINE_TABLE.rows} />
      <P>
        For Claude-Sonnet-5, CRAFT produced a statistically significant but small-to-medium
        negative effect. For gpt-5.5, the effect is null across all measures. The pooled
        significant result averages one real effect and one null effect, which is why per-model
        figures serve as the primary reporting unit, with the pooled column providing contextual
        information. That asymmetry appears in three analyses that do not share a computation
        path.
      </P>
      <DataTable head={ASYMMETRY_TABLE.head} rows={ASYMMETRY_TABLE.rows} />
      <P>
        In each analysis, the pooled figure represents an average of one real effect and one null
        or opposite effect, indicating that the observed asymmetry is not attributable to any
        single analytical choice. By difficulty tier, the delta is negative in eight of nine
        cells, with the only positive value being Easy on GPT at +0.33 across six pairs.
      </P>

      <H2 id="what-drove-the-losses">What drove the losses</H2>
      <DataTable head={LOSS_PATTERN_TABLE.head} rows={LOSS_PATTERN_TABLE.rows} />
      <P>
        Constraint adherence accounts for 21 of the 25 losses and is the sole factor in eight
        cases. The characteristic loss involves a decrease from 4 to 3 in constraint adherence,
        with other subscores remaining unchanged. Completeness is seldom implicated, indicating
        that the penalty is not due to CRAFT verbosity exceeding length limits, but rather to
        constraint drift.
      </P>

      <H2 id="mechanism">Mechanism</H2>
      <P>
        Two extreme cases, both with perfect agreement between the two independent judges, show
        the same CRAFT behavior producing opposite outcomes. In T046, a communication task labeled
        Easy and run on Claude, the constraints require scope discipline, meaning the response
        should answer the question asked and omit unrelated account matters. CRAFT produced a
        comprehensive reply raising three additional items and scored 10 down to 3. In T029, a
        policy task where Claude judged GPT output, the constraints require alternatives beyond
        the denial itself. Baseline gave the correct outcome without them, and CRAFT produced
        structured coverage including four non-waiver options, scoring up from 5 to 10.
      </P>
      <P>
        The interpretation is that CRAFT consistently elicits comprehensive, structured output.
        This tendency is advantageous when task constraints reward coverage, but it is penalized
        when constraints require restraint. Testing this hypothesis against constraint composition
        supports one model only, and only weakly. For Claude-Sonnet-5, this effect is evident with
        r = &minus;0.31 and a mean delta of &minus;1.57 on tasks with three or more negative
        constraints, or &minus;0.67 excluding the extreme case T046, and is absent in gpt-5.5
        (r = +0.11). The pooled null correlation of r = &minus;0.09 reflects the average of these
        opposing patterns rather than an absence of effect. Negative-constraint load does not
        distinguish wins from losses in aggregate, with means of 1.45 and 1.56, respectively.
        Thus, the mechanism is apparent in the Claude-specific slope and in paired case analysis,
        rather than as a consistent monotonic gradient.
      </P>

      <H2 id="inter-rater-reliability">Inter-rater reliability</H2>
      <DataTable head={IRR_TABLE.head} rows={IRR_TABLE.rows} />
      <P>
        The intraclass correlation coefficient (ICC (3,1)) for total scores was 0.821 (two-way
        mixed, single measure, consistency). The judges are fixed and identified, so no
        generalization to a broader population of judges is claimed. Fourteen of 200 cells show
        disagreements greater than two points, and twelve of these cases involve the secondary
        judge assigning a lower score when the primary judge is systematically more generous at
        the upper end of the scale.
      </P>

      <H2 id="stability-subset">Stability subset</H2>
      <P>
        Ten frozen tasks across two conditions and two models at n=3, primary-judge scores only.
      </P>
      <DataTable head={STABILITY_TABLE.head} rows={STABILITY_TABLE.rows} />
      <P>
        Thirty-one of the 40 cells exhibited zero variance across all three runs. Two conclusions
        follow. First, the penalty is reproducible rather than attributable to variance: CRAFT
        responses are slightly less variable than baseline (0.212 vs. 0.227), and T046 scored 4,
        4, and 3 across its three CRAFT runs, indicating consistent penalization rather than
        random sampling error. This addresses concerns that the negative delta could result from
        higher-variance output. Second, the two models differ by approximately a factor of two in
        run-to-run variance under their respective provider-default decoding regimes (0.298 vs.
        0.141), and GPT&rsquo;s variance is identical across conditions to three decimal places,
        indicating that variance is entirely task-driven. The delta-to-noise ratio is 1.37.
      </P>

      <H2 id="provenance">Provenance</H2>
      <P>
        Model fingerprints for all three models remained byte-identical across every manifest
        captured during the approximately 18-hour study window, with captures bracketing each
        dispatch period. The manifest files confirmed that no model changed during the study.
      </P>

      {/* Transcription notes */}
      <section className="pt-6 border-t border-cream-border space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Transcription notes
        </h2>
        <p className="text-xs text-text-muted">
          This page reproduces the report supplied as{" "}
          <a href={PAPER_PDF_HREF} className="underline hover:text-text-body">
            craft-results-methods-deviations.pdf
          </a>
          . Differences between that file and the text above are limited to the following.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-text-muted">
          {TRANSCRIPTION_NOTES.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
