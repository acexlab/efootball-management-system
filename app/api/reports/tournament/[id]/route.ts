import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type MatchRow = {
  id: string;
  match_number: number | null;
  scheduled_at: string | null;
  opponent_team: string | null;
  status: string | null;
};

type StatRow = {
  match_id: string | null;
  player_id: string | null;
  goals: number | null;
  result: string | null;
  opponent_name: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  gamer_tag: string | null;
};

function getServerSupabase(authHeader: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function safeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function wrapText(text: string, maxLength: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    if (!current.length) {
      current = word;
      return;
    }
    const next = `${current} ${word}`;
    if (next.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  const rawAuthHeader = request.headers.get("authorization");
  if (!rawAuthHeader) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  const authHeader = rawAuthHeader.startsWith("Bearer ")
    ? rawAuthHeader
    : `Bearer ${rawAuthHeader}`;

  const supabase = getServerSupabase(authHeader);
  if (!supabase) {
    return NextResponse.json(
      { error: "Missing Supabase configuration." },
      { status: 500 }
    );
  }

  const resolvedParams = await Promise.resolve(params);
  const tournamentId = resolvedParams.id;

  const [
    { data: tournamentRow, error: tournamentError },
    { data: matchRows, error: matchError },
    { data: statRows, error: statError },
    { data: profileRows, error: profileError }
  ] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, name, external_competition")
      .eq("id", tournamentId)
      .maybeSingle(),
    supabase
      .from("matches")
      .select("id, match_number, scheduled_at, opponent_team, status")
      .eq("tournament_id", tournamentId)
      .order("match_number", { ascending: true }),
    supabase.from("match_stats").select("match_id, player_id, goals, result, opponent_name"),
    supabase.from("profiles").select("id, full_name, gamer_tag")
  ]);

  if (tournamentError || matchError || statError || profileError) {
    return NextResponse.json(
      {
        error:
          tournamentError?.message ||
          matchError?.message ||
          statError?.message ||
          profileError?.message ||
          "Unknown error"
      },
      { status: 500 }
    );
  }

  if (!tournamentRow) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }

  const profileMap = new Map(
    (profileRows as ProfileRow[] | null | undefined)?.map((row) => [
      row.id,
      safeText(row.gamer_tag || row.full_name, "Player")
    ]) ?? []
  );

  const statsByMatch = (statRows as StatRow[] | null | undefined)?.reduce<Record<string, StatRow[]>>((acc, row) => {
    const matchId = row.match_id ?? "";
    if (!matchId) return acc;
    if (!acc[matchId]) acc[matchId] = [];
    acc[matchId].push(row);
    return acc;
  }, {}) ?? {};

  const matchesWithStats = (matchRows as MatchRow[] | null | undefined)?.filter(
    (match) => statsByMatch[match.id]?.length
  ) ?? [];

  if (!matchesWithStats.length) {
    return NextResponse.json(
      { error: "No match stats found yet for this tournament." },
      { status: 400 }
    );
  }

  const latestMatchNumber = Math.max(...matchesWithStats.map((match) => match.match_number ?? 0));
  const matchesForReport = matchesWithStats.filter(
    (match) => (match.match_number ?? 0) <= latestMatchNumber
  );

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  let logoImage: { width: number; height: number; image: any } | null = null;
  try {
    const logoPath = path.join(process.cwd(), "public", "brand", "shield-logo.jpg");
    const logoBytes = await readFile(logoPath);
    const embed = await pdf.embedJpg(logoBytes);
    logoImage = { width: embed.width, height: embed.height, image: embed };
  } catch {
    logoImage = null;
  }

  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 48;
  const contentWidth = pageWidth - marginX * 2;

  const palette = {
    primary: rgb(0.0, 0.82, 0.53),
    cyan: rgb(0.18, 0.7, 0.98),
    dark: rgb(0.03, 0.05, 0.08),
    panel: rgb(0.06, 0.09, 0.13),
    panelSoft: rgb(0.08, 0.12, 0.17),
    text: rgb(0.96, 0.98, 1),
    muted: rgb(0.62, 0.7, 0.8),
    border: rgb(0.16, 0.23, 0.32)
  };

  let page = pdf.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - 140;

  const drawBackground = () => {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: palette.dark
    });

    page.drawRectangle({
      x: pageWidth - 180,
      y: pageHeight - 200,
      width: 200,
      height: 200,
      color: rgb(0.0, 0.4, 0.25),
      opacity: 0.08
    });

    page.drawRectangle({
      x: -40,
      y: pageHeight - 220,
      width: 220,
      height: 220,
      color: rgb(0.1, 0.4, 0.7),
      opacity: 0.08
    });
  };

  const drawHeader = () => {
    drawBackground();

    page.drawRectangle({
      x: 0,
      y: pageHeight - 150,
      width: pageWidth,
      height: 150,
      color: palette.panel
    });

    page.drawRectangle({
      x: marginX,
      y: pageHeight - 120,
      width: 58,
      height: 58,
      color: palette.panelSoft,
      borderColor: palette.primary,
      borderWidth: 1.5
    });

    if (logoImage) {
      const scale = Math.min(46 / logoImage.width, 46 / logoImage.height);
      page.drawImage(logoImage.image, {
        x: marginX + 6,
        y: pageHeight - 114,
        width: logoImage.width * scale,
        height: logoImage.height * scale
      });
    } else {
      page.drawText("S", {
        x: marginX + 18,
        y: pageHeight - 106,
        size: 28,
        font: boldFont,
        color: palette.primary
      });
    }

    page.drawText("SHIELD ESPORTS", {
      x: marginX + 76,
      y: pageHeight - 84,
      size: 10,
      font: boldFont,
      color: palette.primary
    });

    const headline = safeText(tournamentRow.name, "Tournament");
    page.drawText(headline.toUpperCase(), {
      x: marginX + 76,
      y: pageHeight - 110,
      size: 22,
      font: boldFont,
      color: palette.text
    });

    page.drawText("MATCH REPORT", {
      x: marginX + 76,
      y: pageHeight - 130,
      size: 14,
      font: boldFont,
      color: palette.text
    });

    page.drawText(safeText(tournamentRow.external_competition, "Shield Esports Tournament"), {
      x: marginX + 76,
      y: pageHeight - 148,
      size: 10,
      font,
      color: palette.muted
    });
  };

  drawHeader();

  const ensureSpace = (minSpace = 140) => {
    if (cursorY < minSpace) {
      page = pdf.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - 110;
      drawHeader();
      cursorY -= 12;
    }
  };

  matchesForReport.forEach((match, matchIndex) => {
    ensureSpace();
    const cardTop = cursorY;
    const cardHeight = 100;
    page.drawRectangle({
      x: marginX,
      y: cardTop - cardHeight + 8,
      width: contentWidth,
      height: cardHeight,
      color: palette.panelSoft,
      borderColor: palette.border,
      borderWidth: 1.2
    });

    page.drawText(`Match Day ${match.match_number ?? 0}`, {
      x: marginX + 18,
      y: cardTop - 26,
      size: 12,
      font: boldFont,
      color: palette.primary
    });

    page.drawText("Opponent", {
      x: marginX + 18,
      y: cardTop - 48,
      size: 8,
      font: boldFont,
      color: palette.muted
    });
    page.drawText(safeText(match.opponent_team, "Opponent Team"), {
      x: marginX + 18,
      y: cardTop - 64,
      size: 11,
      font,
      color: palette.text
    });

    page.drawText("Date", {
      x: marginX + 210,
      y: cardTop - 48,
      size: 8,
      font: boldFont,
      color: palette.muted
    });
    page.drawText(
      match.scheduled_at ? new Date(match.scheduled_at).toLocaleString() : "Not scheduled",
      { x: marginX + 210, y: cardTop - 64, size: 11, font, color: palette.text }
    );

    page.drawText(`MD ${matchIndex + 1}`, {
      x: marginX + contentWidth - 52,
      y: cardTop - 32,
      size: 10,
      font: boldFont,
      color: palette.cyan
    });

    cursorY = cardTop - cardHeight - 8;

    const columnX = {
      player: marginX + 12,
      opponent: marginX + 210,
      goals: marginX + 380,
      result: marginX + 470
    };

    page.drawText("PLAYER", { x: columnX.player, y: cursorY, size: 8, font: boldFont, color: palette.muted });
    page.drawText("OPPONENT", { x: columnX.opponent, y: cursorY, size: 8, font: boldFont, color: palette.muted });
    page.drawText("GOALS", { x: columnX.goals, y: cursorY, size: 8, font: boldFont, color: palette.muted });
    page.drawText("RESULT", { x: columnX.result, y: cursorY, size: 8, font: boldFont, color: palette.muted });
    cursorY -= 16;

    const statRowsForMatch = statsByMatch[match.id] ?? [];
    statRowsForMatch.forEach((stat, index) => {
      ensureSpace(80);
      if (index % 2 === 0) {
        page.drawRectangle({
          x: marginX,
          y: cursorY - 10,
          width: contentWidth,
          height: 18,
          color: rgb(0.09, 0.13, 0.18)
        });
      }

      const playerName = profileMap.get(stat.player_id ?? "") ?? "Player";
      const opponentName = safeText(stat.opponent_name, "Opponent");
      const goals = (stat.goals ?? 0).toString();
      const result = safeText(stat.result, "draw").toUpperCase();

      wrapText(playerName, 24).slice(0, 2).forEach((line, lineIndex) => {
        page.drawText(line, {
          x: columnX.player,
          y: cursorY - lineIndex * 10,
          size: 10,
          font,
          color: palette.text
        });
      });

      wrapText(opponentName, 24).slice(0, 2).forEach((line, lineIndex) => {
        page.drawText(line, {
          x: columnX.opponent,
          y: cursorY - lineIndex * 10,
          size: 10,
          font,
          color: palette.text
        });
      });

      page.drawText(goals, { x: columnX.goals, y: cursorY, size: 10, font, color: palette.text });
      page.drawText(result, { x: columnX.result, y: cursorY, size: 10, font: boldFont, color: palette.cyan });

      cursorY -= 20;
    });

    cursorY -= 12;
  });

  // Summary footer
  const totalMatches = matchesForReport.length;
  const totalGoals = matchesForReport.reduce((sum, match) => {
    const stats = statsByMatch[match.id] ?? [];
    return sum + stats.reduce((acc, row) => acc + ((row.goals ?? 0) as number), 0);
  }, 0);
  const totalDraws = matchesForReport.reduce((sum, match) => {
    const stats = statsByMatch[match.id] ?? [];
    return sum + stats.filter((row) => String(row.result ?? "").toLowerCase() === "draw").length;
  }, 0);

  ensureSpace(120);
  page.drawRectangle({
    x: marginX,
    y: cursorY - 64,
    width: contentWidth,
    height: 64,
    color: palette.panelSoft,
    borderColor: palette.border,
    borderWidth: 1
  });
  page.drawText(`${totalMatches}`, { x: marginX + 18, y: cursorY - 34, size: 18, font: boldFont, color: palette.primary });
  page.drawText("Matches played", { x: marginX + 18, y: cursorY - 50, size: 8, font: font, color: palette.muted });

  page.drawText(`${totalGoals}`, { x: marginX + 170, y: cursorY - 34, size: 18, font: boldFont, color: palette.cyan });
  page.drawText("Goals scored", { x: marginX + 170, y: cursorY - 50, size: 8, font: font, color: palette.muted });

  page.drawText(`${totalDraws}`, { x: marginX + 320, y: cursorY - 34, size: 18, font: boldFont, color: palette.primary });
  page.drawText("Draws", { x: marginX + 320, y: cursorY - 50, size: 8, font: font, color: palette.muted });

  const timestamp = new Date().toLocaleString();
  page.drawText(`Report generated ${timestamp}`, {
    x: marginX + 420,
    y: cursorY - 44,
    size: 8,
    font,
    color: palette.muted
  });

  const pdfBytes = await pdf.save();

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${tournamentRow.name}-matchday-report.pdf"`
    }
  });
}
