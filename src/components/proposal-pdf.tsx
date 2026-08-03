import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatMoney } from "@/lib/proposals";
import type { ProposalBlock, ProposalRow } from "@/types/db";
import type { ProposalExperienceData } from "./proposal-experience";

const s = StyleSheet.create({
  page: {
    width: 720,
    height: 405,
    padding: 38,
    backgroundColor: "#061b13",
    color: "#f4f7e9",
    fontFamily: "Helvetica",
  },
  light: { backgroundColor: "#edf0df", color: "#082016" },
  eyebrow: {
    color: "#dfff1f",
    fontSize: 8,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  title: { fontSize: 34, fontFamily: "Helvetica-Bold", lineHeight: 1, maxWidth: 560 },
  coverTitle: { fontSize: 56, fontFamily: "Helvetica-Bold", lineHeight: 0.9, maxWidth: 500 },
  body: { marginTop: 18, fontSize: 11, lineHeight: 1.5, color: "#b9c4bc", maxWidth: 570 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#536159",
    paddingVertical: 7,
  },
  label: { width: "34%", fontFamily: "Helvetica-Bold", fontSize: 8 },
  cell: { flex: 1, fontSize: 8, color: "#c4ccc7" },
  cards: { flexDirection: "row", marginTop: 22 },
  card: { flex: 1, padding: 15, backgroundColor: "#102a20", marginRight: 2 },
  accentCard: { backgroundColor: "#dfff1f", color: "#061b13" },
  amount: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 8 },
  image: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 310,
    height: 405,
    objectFit: "cover",
    opacity: 0.55,
  },
  footer: {
    position: "absolute",
    left: 38,
    right: 38,
    bottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#87968d",
  },
});

export function ProposalPdfDocument({ data }: { data: ProposalExperienceData }) {
  const enabled = data.content.blocks.filter((block) => block.enabled);
  return (
    <Document title={`${data.title} - ${data.recipientName}`} author="Go Team Go">
      {enabled.flatMap((block, index) => renderPdfBlock(block, index, data))}
    </Document>
  );
}

function renderPdfBlock(block: ProposalBlock, index: number, data: ProposalExperienceData) {
  if (block.type === "cover")
    return [
      <Page key={block.id} size={[720, 405]} style={s.page}>
        {block.imageUrl || data.recipientPhotoUrl ? (
          <Image src={block.imageUrl || data.recipientPhotoUrl || ""} style={s.image} />
        ) : null}
        <View style={{ marginTop: 105 }}>
          <Text style={s.eyebrow}>PREPARED EXCLUSIVELY FOR</Text>
          <Text style={s.coverTitle}>{data.recipientName}</Text>
          <Text style={[s.body, { fontSize: 16 }]}>
            {block.title} · {data.recipientSport}
          </Text>
        </View>
        <PdfFooter data={data} page={index + 1} />
      </Page>,
    ];
  const rows = block.rows ?? [];
  const chunks = rows.length > 7 ? chunk(rows, 7) : [rows];
  return chunks.map((pageRows, pageIndex) => (
    <Page
      key={`${block.id}-${pageIndex}`}
      size={[720, 405]}
      style={[s.page, index % 3 === 2 ? s.light : {}]}
    >
      <Text style={s.eyebrow}>
        {String(index).padStart(2, "0")} · {block.type.replace("_", " ")}
      </Text>
      <Text style={s.title}>
        {block.title}
        {pageIndex ? " (cont.)" : ""}
      </Text>
      {block.subtitle && <Text style={s.body}>{block.subtitle}</Text>}
      {block.type === "scholarship" && pageIndex === 0 ? (
        <Scholarship block={block} data={data} />
      ) : null}
      {block.body && pageIndex === 0 ? <Text style={s.body}>{block.body}</Text> : null}
      {pageRows.length ? <PdfRows rows={pageRows} data={data} /> : null}
      {block.imageUrl && pageIndex === 0 && block.type !== "scholarship" ? (
        <Image
          src={block.imageUrl}
          style={{
            position: "absolute",
            right: 38,
            bottom: 38,
            width: 220,
            height: 130,
            objectFit: "cover",
          }}
        />
      ) : null}
      <PdfFooter data={data} page={index + 1} />
    </Page>
  ));
}

function Scholarship({ block, data }: { block: ProposalBlock; data: ProposalExperienceData }) {
  const items = [
    ["Annual cost", Number(block.data?.totalCost ?? 0)],
    ["Scholarship", Number(block.data?.scholarship ?? 0)],
    ["Out-of-pocket", Number(block.data?.outOfPocket ?? 0)],
  ] as const;
  return (
    <View style={s.cards}>
      {items.map((item, index) => (
        <View key={item[0]} style={[s.card, index > 0 ? s.accentCard : {}]}>
          <Text style={{ fontSize: 7, textTransform: "uppercase" }}>{item[0]}</Text>
          <Text style={s.amount}>{formatMoney(item[1], data.content.currency, data.language)}</Text>
        </View>
      ))}
    </View>
  );
}

function PdfRows({ rows, data }: { rows: ProposalRow[]; data: ProposalExperienceData }) {
  return (
    <View style={{ marginTop: 18 }}>
      {rows.map((row) => (
        <View key={row.id} style={s.row}>
          <Text style={s.label}>{row.label}</Text>
          <Text style={s.cell}>
            {row.amount !== undefined
              ? formatMoney(row.amount, data.content.currency, data.language)
              : row.value || row.frequency || ""}
          </Text>
          <Text style={[s.cell, { flex: 2 }]}>{row.notes || row.timing || row.url || ""}</Text>
        </View>
      ))}
    </View>
  );
}

function PdfFooter({ data, page }: { data: ProposalExperienceData; page: number }) {
  return (
    <View style={s.footer}>
      <Text>GO TEAM GO · {data.recipientName}</Text>
      <Text>
        V{data.versionNumber ?? 1} · {String(page).padStart(2, "0")}
      </Text>
    </View>
  );
}
function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
