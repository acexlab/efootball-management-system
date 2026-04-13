"use client";

import { FormEvent, useMemo, useState } from "react";
import type { PlayerOption } from "@/lib/types";

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

export type NewTournament = {
  name: string;
  startDate: string;
  endDate: string;
  players: number;
  format: string;
  slotCount: number;
  subCount: number;
  captainId: string;
  viceCaptainId: string;
  participantIds: string[];
};

export function CreateTournamentModal({
  open,
  onClose,
  onCreate,
  playerOptions
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (tournament: NewTournament) => void | Promise<void>;
  playerOptions: PlayerOption[];
}) {
  const today = getTodayDate();
  const [form, setForm] = useState<NewTournament>({
    name: "",
    startDate: today,
    endDate: today,
    players: 0,
    format: "Slot Based",
    slotCount: 5,
    subCount: 3,
    captainId: "",
    viceCaptainId: "",
    participantIds: []
  });
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

    if (form.participantIds.length < form.slotCount + form.subCount) {
      setError("Selected players must cover both main players and substitutes.");
      return;
    }

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

    setError("");
    onCreate({
      ...form,
      name: form.name.trim(),
      format: form.format.trim() || "Slot Based",
      players: form.participantIds.length
    });
    setForm({
      name: "",
      startDate: today,
      endDate: today,
      players: 0,
      format: "Slot Based",
      slotCount: 5,
      subCount: 3,
      captainId: "",
      viceCaptainId: "",
      participantIds: []
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/72 px-4 py-6">
      <div className="panel w-full max-w-4xl rounded-[30px] p-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-[color:var(--text-muted)]">
              Tournament control
            </p>
            <h3
              className="mt-2 text-2xl font-black uppercase tracking-[0.12em] text-white"
              style={{ fontFamily: "\"Orbitron\", sans-serif" }}
            >
              Create Tournament
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-[color:var(--text-muted)] transition hover:bg-white/[0.05] hover:text-white"
          >
            Close
          </button>
        </div>

        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <Field
            label="Tournament name"
            value={form.name}
            onChange={(value) => setForm((state) => ({ ...state, name: value }))}
            placeholder="Shield Series A"
          />
          <Field
            label="Format"
            value={form.format}
            onChange={(value) => setForm((state) => ({ ...state, format: value }))}
            placeholder="Slot Based"
          />
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
            label="Main players"
            value={String(form.slotCount)}
            onChange={(value) => setForm((state) => ({ ...state, slotCount: Number(value) || 0 }))}
            placeholder="11"
            type="number"
          />
          <Field
            label="Substitutes"
            value={String(form.subCount)}
            onChange={(value) => setForm((state) => ({ ...state, subCount: Number(value) || 0 }))}
            placeholder="5"
            type="number"
          />
          <ReadOnlyField label="Selected players" value={String(form.participantIds.length)} />

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

          <div className="md:col-span-2">
            <p className="text-sm text-[color:var(--text-muted)]">Tournament squad</p>
            <div className="mt-3 grid max-h-[280px] gap-3 overflow-auto rounded-[24px] border border-white/8 bg-black/20 p-4 md:grid-cols-2">
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
                      <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                        {player.role}
                      </p>
                    </div>
                  </label>
                ))
              ) : (
                <p className="text-sm text-[color:var(--text-muted)]">
                  No registered players yet. Ask members to sign in first.
                </p>
              )}
            </div>
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
              Create Tournament
            </button>
          </div>
        </form>
      </div>
    </div>
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
