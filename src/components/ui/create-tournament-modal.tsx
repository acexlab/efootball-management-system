"use client";

import { FormEvent, useMemo, useState } from "react";
import type { PlayerOption, TournamentFormatMode, TournamentScope } from "@/lib/types";

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export type NewTournament = {
  name: string;
  teamName: string;
  startDate: string;
  endDate: string;
  players: number;
  format: string;
  slotCount: number;
  subCount: number;
  captainId: string;
  viceCaptainId: string;
  participantIds: string[];
  scope: TournamentScope;
  formatMode: TournamentFormatMode;
  groupCount: number;
};

export function CreateTournamentModal({
  open,
  onClose,
  onCreate,
  playerOptions,
  defaultScope = "inter_clan"
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (tournament: NewTournament) => void | Promise<void>;
  playerOptions: PlayerOption[];
  defaultScope?: TournamentScope;
}) {
  const today = getTodayDate();

  const buildInitialForm = (): NewTournament => ({
    name: "",
    teamName: "Shield Entity",
    startDate: today,
    endDate: today,
    players: 0,
    format: defaultScope === "intra_clan" ? "League" : "Slot Based",
    slotCount: defaultScope === "intra_clan" ? 2 : 5,
    subCount: defaultScope === "intra_clan" ? 0 : 3,
    captainId: "",
    viceCaptainId: "",
    participantIds: [],
    scope: defaultScope,
    formatMode: "league",
    groupCount: 2
  });

  const [form, setForm] = useState<NewTournament>(buildInitialForm);
  const [error, setError] = useState("");

  const sortedPlayers = useMemo(
    () => [...playerOptions].sort((a, b) => a.name.localeCompare(b.name)),
    [playerOptions]
  );

  if (!open) return null;

  function handleToggleParticipant(id: string) {
    setForm((state) => {
      const exists = state.participantIds.includes(id);
      const participantIds = exists
        ? state.participantIds.filter((item) => item !== id)
        : [...state.participantIds, id];

      return {
        ...state,
        participantIds,
        players: participantIds.length
      };
    });
  }

  function switchScope(scope: TournamentScope) {
    setForm((state) => ({
      ...state,
      scope,
      format: scope === "intra_clan" ? "League" : "Slot Based",
      formatMode: "league",
      slotCount: scope === "intra_clan" ? 2 : Math.max(state.slotCount, 5),
      subCount: scope === "intra_clan" ? 0 : Math.max(state.subCount, 3),
      captainId: scope === "intra_clan" ? "" : state.captainId,
      viceCaptainId: scope === "intra_clan" ? "" : state.viceCaptainId
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Tournament name is required.");
      return;
    }

    if (form.participantIds.length === 0) {
      setError("Select at least one tournament player.");
      return;
    }

    if (!form.startDate || !form.endDate) {
      setError("Start date and end date are required.");
      return;
    }

    if (form.endDate < form.startDate) {
      setError("End date cannot be earlier than start date.");
      return;
    }

    if (form.scope === "intra_clan" && form.slotCount !== 2) {
      setError("Individual intra clan tournaments currently support 2 match slots only.");
      return;
    }

    const minimumPlayers =
      form.scope === "intra_clan"
        ? form.formatMode === "group_knockout"
          ? Math.max(form.groupCount * 2, 4)
          : 2
        : form.slotCount + form.subCount;

    if (form.participantIds.length < minimumPlayers) {
      setError(
        form.scope === "intra_clan"
          ? form.formatMode === "group_knockout"
            ? "Select enough players to keep at least 2 players in each group."
            : "Select at least 2 players for an individual tournament."
          : "Selected players must cover both main players and substitutes."
      );
      return;
    }

    if (form.scope === "inter_clan") {
      if (!form.captainId || !form.viceCaptainId) {
        setError("Assign both a captain and a vice-captain.");
        return;
      }

      if (form.captainId === form.viceCaptainId) {
        setError("Captain and vice-captain must be different players.");
        return;
      }

      const participantIds = new Set(form.participantIds);
      if (!participantIds.has(form.captainId) || !participantIds.has(form.viceCaptainId)) {
        setError("Captain and vice-captain must be included in the selected squad.");
        return;
      }
    }

    if (form.scope === "intra_clan" && form.formatMode === "group_knockout" && form.groupCount < 2) {
      setError("Group + knockout needs at least 2 groups.");
      return;
    }

    setError("");
    onCreate({
      ...form,
      name: form.name.trim(),
      teamName: form.teamName.trim() || "Shield Entity",
      format:
        form.scope === "intra_clan"
          ? form.formatMode === "group_knockout"
            ? `Group + Knockout • ${Math.max(form.groupCount, 2)} Groups`
            : form.formatMode === "knockout"
              ? "Knockout"
              : "League"
          : form.format.trim() || "Slot Based",
      players: form.participantIds.length,
      captainId: form.scope === "intra_clan" ? "" : form.captainId,
      viceCaptainId: form.scope === "intra_clan" ? "" : form.viceCaptainId
    });
    setForm(buildInitialForm());
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/72 px-4 py-6">
      <div className="panel flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[30px]">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--text-muted)]">Tournament control</p>
            <h3
              className="mt-2 text-xl font-black uppercase tracking-[0.12em] text-white sm:text-2xl"
              style={{ fontFamily: "\"Orbitron\", sans-serif" }}
            >
              {form.scope === "intra_clan" ? "Create Intra Clan Tournament" : "Create Inter Clan Tournament"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-[color:var(--text-muted)] transition hover:bg-white/[0.05] hover:text-white"
          >
            Close
          </button>
        </div>

        <form className="flex-1 overflow-y-auto px-4 py-4 sm:px-6" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ScopeButton
              active={form.scope === "inter_clan"}
              title="Inter Clan Tournament"
              description="External-style tournament flow with squad, captain, and vice-captain."
              onClick={() => switchScope("inter_clan")}
            />
            <ScopeButton
              active={form.scope === "intra_clan"}
              title="Intra Clan Tournament"
              description="Individual formats: knockout, league, or group + knockout."
              onClick={() => switchScope("intra_clan")}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Tournament name"
              value={form.name}
              onChange={(value) => setForm((state) => ({ ...state, name: value }))}
              placeholder={form.scope === "intra_clan" ? "Shield Intra League" : "Shield Series A"}
            />
            <Field
              label="Our team name"
              value={form.teamName}
              onChange={(value) => setForm((state) => ({ ...state, teamName: value }))}
              placeholder="Shield Entity"
            />

            {form.scope === "inter_clan" ? (
              <Field
                label="Format"
                value={form.format}
                onChange={(value) => setForm((state) => ({ ...state, format: value }))}
                placeholder="Slot Based"
              />
            ) : (
              <SelectField
                label="Tournament mode"
                value={form.formatMode}
                onChange={(value) =>
                  setForm((state) => ({
                    ...state,
                    formatMode: value as TournamentFormatMode,
                    format:
                      value === "group_knockout"
                        ? `Group + Knockout • ${state.groupCount} Groups`
                        : value === "knockout"
                          ? "Knockout"
                          : "League"
                  }))
                }
                options={[
                  { label: "Knockout Tournament (Individual)", value: "knockout" },
                  { label: "League Tournament (Individual)", value: "league" },
                  { label: "Group + Knockout Tournament (Individual)", value: "group_knockout" }
                ]}
                placeholder="Select mode"
              />
            )}

            <Field
              label="Start date"
              value={form.startDate}
              onChange={(value) => setForm((state) => ({ ...state, startDate: value }))}
              placeholder="2026-05-01"
              type="date"
            />
            <Field
              label="End date"
              value={form.endDate}
              onChange={(value) => setForm((state) => ({ ...state, endDate: value }))}
              placeholder="2026-05-15"
              type="date"
            />
            <Field
              label={form.scope === "intra_clan" ? "Match slots" : "Main players"}
              value={String(form.slotCount)}
              onChange={(value) => setForm((state) => ({ ...state, slotCount: Number(value) || 0 }))}
              placeholder={form.scope === "intra_clan" ? "2" : "11"}
              type="number"
            />

            {form.scope === "inter_clan" ? (
              <Field
                label="Substitutes"
                value={String(form.subCount)}
                onChange={(value) => setForm((state) => ({ ...state, subCount: Number(value) || 0 }))}
                placeholder="5"
                type="number"
              />
            ) : form.formatMode === "group_knockout" ? (
              <Field
                label="Groups"
                value={String(form.groupCount)}
                onChange={(value) => setForm((state) => ({ ...state, groupCount: Math.max(Number(value) || 1, 1) }))}
                placeholder="2"
                type="number"
              />
            ) : (
              <ReadOnlyField
                label="Format Structure"
                value={form.formatMode === "knockout" ? "Single elimination" : "Round robin"}
              />
            )}

            <ReadOnlyField label="Selected players" value={String(form.participantIds.length)} />

            {form.scope === "inter_clan" ? (
              <>
                <SelectField
                  label="Captain"
                  value={form.captainId}
                  onChange={(value) => setForm((state) => ({ ...state, captainId: value }))}
                  options={sortedPlayers
                    .filter((player) => form.participantIds.includes(player.id))
                    .map((player) => ({ label: player.name, value: player.id }))}
                  placeholder="Select captain"
                />
                <SelectField
                  label="Vice-Captain"
                  value={form.viceCaptainId}
                  onChange={(value) => setForm((state) => ({ ...state, viceCaptainId: value }))}
                  options={sortedPlayers
                    .filter((player) => form.participantIds.includes(player.id))
                    .map((player) => ({ label: player.name, value: player.id }))}
                  placeholder="Select vice-captain"
                />
              </>
            ) : (
              <div className="md:col-span-2 rounded-2xl border border-[#00D4FF]/20 bg-[#00D4FF]/10 px-4 py-3 text-sm text-[#C5F5FF]">
                Intra clan tournaments are individual formats, so captain and vice-captain are not needed.
              </div>
            )}

            <div className="md:col-span-2">
              <p className="text-sm text-[color:var(--text-muted)]">Tournament squad</p>
              <div className="mt-3 grid max-h-[320px] gap-3 overflow-y-auto rounded-[24px] border border-white/8 bg-black/20 p-3 sm:p-4 md:grid-cols-2">
                {sortedPlayers.length ? (
                  sortedPlayers.map((player) => (
                    <label
                      key={player.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white"
                    >
                      <input
                        type="checkbox"
                        checked={form.participantIds.includes(player.id)}
                        onChange={() => handleToggleParticipant(player.id)}
                        className="h-4 w-4 accent-[#00FF88]"
                      />
                      <div>
                        <p className="font-semibold">{player.name}</p>
                        <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{player.role}</p>
                      </div>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-[color:var(--text-muted)]">No registered players yet. Ask members to sign in first.</p>
                )}
              </div>

              {form.scope === "intra_clan" ? (
                <p className="mt-2 text-xs text-[color:var(--text-muted)]">
                  {form.formatMode === "knockout"
                    ? "Single elimination format. A player is out after one loss and winners advance to the next round."
                    : form.formatMode === "league"
                      ? "League format. Every player competes against all others and the highest points total wins."
                      : "Group + knockout format. Players are split into groups, league matches happen inside groups, and top players advance to knockout rounds."}
                </p>
              ) : null}
            </div>

            {error ? (
              <div className="md:col-span-2 rounded-2xl border border-[#FF5470]/20 bg-[#FF5470]/10 px-4 py-3 text-sm text-[#FFD6DE]">
                {error}
              </div>
            ) : null}

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                className="w-full rounded-2xl border border-[#00FF88]/25 bg-[#00FF88]/12 px-4 py-3 font-semibold text-[#00FF88] transition hover:bg-[#00FF88]/18 md:w-auto"
              >
                {form.scope === "intra_clan" ? "Create Intra Clan Tournament" : "Create Inter Clan Tournament"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScopeButton({
  active,
  title,
  description,
  onClick
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-4 text-left transition ${
        active
          ? "border-[#00FF88]/30 bg-[#00FF88]/10"
          : "border-white/8 bg-white/[0.03] hover:border-[#00D4FF]/25"
      }`}
    >
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">{description}</p>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <div className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white">{value}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm text-[color:var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#00D4FF]/30"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
