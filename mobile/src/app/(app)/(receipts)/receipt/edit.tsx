// One field of a receipt, in iOS's bottom sheet: the keyboard (or calendar,
// or list) is up at once, Save puts it in the list right away, dragging the
// sheet down cancels. A category is saved with the tap itself.

import { useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SymbolView } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { Button } from "../../../../components/Button";
import { PressableScale } from "../../../../components/PressableScale";
import { Text } from "../../../../components/Text";
import { locale, s } from "../../../../i18n";
import {
  CATEGORIES,
  EDITABLE_CURRENCIES,
  parseAmount,
  toPlainDate,
  type EditableCurrency,
  type ReceiptPatch,
} from "../../../../lib/edits";
import { formatMoney, parseReceiptDate } from "../../../../lib/format";
import { useHome } from "../../../../lib/HomeProvider";
import { useReceiptActions } from "../../../../lib/ReceiptActions";
import { colors, fonts, radius, space } from "../../../../theme";

type Field = "merchant" | "amount" | "date" | "category";

const DETENTS: Record<Field, number[]> = {
  merchant: [0.45],
  amount: [0.5],
  date: [0.75],
  category: [0.75],
};

const INTL_LOCALE = { en: "en-GB", sv: "sv-SE", fr: "fr-FR" } as const;

export default function EditField() {
  const { id, field: rawField } = useLocalSearchParams<{ id: string; field: Field }>();
  const field: Field = (["merchant", "amount", "date", "category"] as const).includes(rawField) ? rawField : "merchant";
  const { home } = useHome();
  const { save } = useReceiptActions();
  const r = home?.state === "ready" ? home.receipts.find((x) => x.id === id) : undefined;

  const [merchant, setMerchant] = useState(r?.merchant ?? "");
  const [amount, setAmount] = useState(
    r?.total != null ? formatMoney(r.total, "XXX", locale).replace(/\s*XXX$/, "") : "",
  );
  const editableCurrency = (EDITABLE_CURRENCIES as readonly string[]).includes(r?.currency ?? "");
  const [currency, setCurrency] = useState<string>(r?.currency ?? (home?.state === "ready" ? home.homeCurrency : "SEK"));
  const [date, setDate] = useState<Date>(parseReceiptDate(r?.date ?? null) ?? new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = { merchant: s.edit.merchant, amount: s.edit.amount, date: s.edit.date, category: s.edit.category }[field];

  const submit = async (patch: ReceiptPatch) => {
    setBusy(true);
    const ok = await save(id, patch);
    setBusy(false);
    if (ok) {
      void Haptics.selectionAsync();
      router.back();
    }
  };

  const onSave = () => {
    if (field === "merchant") {
      const value = merchant.trim();
      if (!value) return;
      void submit({ merchant: value });
    } else if (field === "amount") {
      const value = parseAmount(amount);
      if (value == null) {
        setError(s.edit.invalidAmount);
        AccessibilityInfo.announceForAccessibility(s.edit.invalidAmount);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      const patch: ReceiptPatch = { amount: value };
      // Only the currencies the server knows; another one stays as it is.
      if ((EDITABLE_CURRENCIES as readonly string[]).includes(currency)) patch.currency = currency as EditableCurrency;
      void submit(patch);
    } else if (field === "date") {
      void submit({ receipt_date: toPlainDate(date) });
    }
  };

  return (
    <>
      <Stack.Screen options={{ sheetAllowedDetents: DETENTS[field] }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="displayLg" accessibilityRole="header">
          {title}
        </Text>

        {field === "merchant" ? (
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder={s.edit.merchantPlaceholder}
            placeholderTextColor={colors.inkFaint}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={onSave}
            maxLength={200}
            maxFontSizeMultiplier={1.4}
            accessibilityLabel={s.edit.merchant}
            style={styles.input}
          />
        ) : null}

        {field === "amount" ? (
          <>
            <TextInput
              value={amount}
              onChangeText={(t) => {
                setAmount(t);
                if (error) setError(null);
              }}
              placeholder="0,00"
              placeholderTextColor={colors.inkFaint}
              autoFocus
              keyboardType="decimal-pad"
              maxFontSizeMultiplier={1.2}
              accessibilityLabel={s.edit.amount}
              style={[styles.input, styles.amountInput, error && styles.inputError]}
            />
            {error ? (
              <Text variant="caption" color={colors.attentionDeep}>
                {error}
              </Text>
            ) : null}
            {editableCurrency || !r?.currency ? (
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={s.edit.currency}>
                {EDITABLE_CURRENCIES.map((c) => {
                  const selected = currency === c;
                  return (
                    <PressableScale
                      key={c}
                      scaleTo={0.94}
                      onPress={() => {
                        setCurrency(c);
                        void Haptics.selectionAsync();
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={styles.chipLabel} color={selected ? colors.ink : colors.inkMuted}>
                        {c}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            ) : (
              <Text variant="caption" color={colors.inkMuted}>
                {r?.currency}
              </Text>
            )}
          </>
        ) : null}

        {field === "date" ? (
          <DateTimePicker
            value={date}
            mode="date"
            display="inline"
            maximumDate={new Date()}
            locale={INTL_LOCALE[locale]}
            accentColor={colors.brandAction}
            themeVariant="light"
            onValueChange={(_e, d) => {
              setDate(d);
              void Haptics.selectionAsync();
            }}
          />
        ) : null}

        {field === "category" ? (
          <View style={styles.list}>
            {CATEGORIES.map((c, i) => {
              const selected = r?.category === c;
              return (
                <PressableScale
                  key={c}
                  scaleTo={0.99}
                  disabled={busy}
                  onPress={() => void submit({ category: c })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[styles.option, i > 0 && styles.optionDivider]}
                >
                  <Text variant="body" style={styles.optionLabel}>
                    {s.categories[c]}
                  </Text>
                  {selected ? <SymbolView name="checkmark" size={17} tintColor={colors.brandAction} weight="semibold" /> : null}
                </PressableScale>
              );
            })}
          </View>
        ) : null}

        {field !== "category" ? (
          <Button
            label={s.edit.save}
            onPress={onSave}
            busy={busy}
            disabled={field === "merchant" ? !merchant.trim() : field === "amount" ? !amount.trim() : false}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg },
  input: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brandAction,
    backgroundColor: colors.card,
    paddingHorizontal: space.lg,
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.ink,
  },
  // An amount is money: Geist Mono (DESIGN.md).
  amountInput: { fontFamily: fonts.mono, fontSize: 28, minHeight: 64, fontVariant: ["tabular-nums"] },
  inputError: { borderColor: colors.attention },
  chips: { flexDirection: "row", gap: space.sm },
  chip: {
    minHeight: 44,
    minWidth: 64,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  chipSelected: { backgroundColor: colors.card, borderColor: colors.ink },
  chipLabel: { fontFamily: fonts.bold, fontSize: 14 },
  list: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
  },
  option: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
  },
  optionDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  optionLabel: { flex: 1 },
});
