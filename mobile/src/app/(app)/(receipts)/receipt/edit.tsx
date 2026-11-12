// One field of a receipt, in iOS's bottom sheet: the keyboard (or calendar,
// or list) is up at once, Save puts it in the list right away, dragging the
// sheet down cancels. A category is saved with the tap itself.
// `field=all` (the receipt screen's Edit): every field in one sheet, saved
// together with one Save; only what changed is sent.

import { useState } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
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
import { useHome, useReceipt } from "../../../../lib/HomeProvider";
import { useReceiptActions } from "../../../../lib/ReceiptActions";
import { fonts, radius, space, makeStyles, useColors } from "../../../../theme";

type Field = "merchant" | "amount" | "date" | "category" | "all";

const INTL_LOCALE = { en: "en-GB", sv: "sv-SE", fr: "fr-FR" } as const;

export default function EditField() {
  const styles = useStyles();
  const colors = useColors();
  const { id, field: rawField } = useLocalSearchParams<{ id: string; field: Field }>();
  const field: Field = (["merchant", "amount", "date", "category", "all"] as const).includes(rawField) ? rawField : "merchant";
  const all = field === "all";
  const { home } = useHome();
  const { save } = useReceiptActions();
  const r = useReceipt(id);

  const [merchant, setMerchant] = useState(r?.merchant ?? "");
  const [amount, setAmount] = useState(
    r?.total != null ? formatMoney(r.total, "XXX", locale).replace(/\s*XXX$/, "") : "",
  );
  const editableCurrency = (EDITABLE_CURRENCIES as readonly string[]).includes(r?.currency ?? "");
  const [currency, setCurrency] = useState<string>(r?.currency ?? (home?.state === "ready" ? home.homeCurrency : "SEK"));
  const initialDate = parseReceiptDate(r?.date ?? null);
  const [date, setDate] = useState<Date>(initialDate ?? new Date());
  const [dateTouched, setDateTouched] = useState(false);
  // Edit-all on a receipt without a date: "Add date" until tapped, so the
  // picker never shows today as if it were the receipt's day.
  const [dateOpen, setDateOpen] = useState(initialDate != null);
  const [focused, setFocused] = useState<"merchant" | "amount" | null>(null);
  const [category, setCategory] = useState<ReceiptPatch["category"]>(r?.category);
  const [error, setError] = useState<string | null>(null);

  const title = {
    merchant: s.edit.merchant,
    amount: s.edit.amount,
    date: s.edit.date,
    category: s.edit.category,
    all: s.edit.editTitle,
  }[field];

  const badAmount = () => {
    setError(s.edit.invalidAmount);
    AccessibilityInfo.announceForAccessibility(s.edit.invalidAmount);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  // The change shows at once and the sheet closes; if the server refuses,
  // it is undone with a message (ReceiptActions).
  const submit = (patch: ReceiptPatch) => {
    void save(id, patch);
    void Haptics.selectionAsync();
    router.back();
  };

  const onSave = () => {
    if (all) {
      const patch: ReceiptPatch = {};
      const name = merchant.trim();
      if (name && name !== (r?.merchant ?? "")) patch.merchant = name;
      if (amount.trim()) {
        const value = parseAmount(amount);
        if (value == null) return badAmount();
        if (value !== r?.total) patch.amount = value;
        if ((EDITABLE_CURRENCIES as readonly string[]).includes(currency) && currency !== r?.currency) {
          patch.currency = currency as EditableCurrency;
          patch.amount = value;
        }
      }
      if (dateTouched || !initialDate) {
        const day = toPlainDate(date);
        if (dateTouched && (!initialDate || day !== toPlainDate(initialDate))) patch.receipt_date = day;
      }
      if (category && category !== r?.category) patch.category = category;
      // Nothing changed: the sheet just closes (an empty patch would confirm).
      if (Object.keys(patch).length === 0) {
        router.back();
        return;
      }
      submit(patch);
      return;
    }
    if (field === "merchant") {
      const value = merchant.trim();
      if (!value) return;
      submit({ merchant: value });
    } else if (field === "amount") {
      const value = parseAmount(amount);
      if (value == null) return badAmount();
      const patch: ReceiptPatch = { amount: value };
      // Only the currencies the server knows; another one stays as it is.
      if ((EDITABLE_CURRENCIES as readonly string[]).includes(currency)) patch.currency = currency as EditableCurrency;
      submit(patch);
    } else if (field === "date") {
      submit({ receipt_date: toPlainDate(date) });
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="displayLg" accessibilityRole="header">
          {title}
        </Text>

        {all ? (
          <Text variant="micro" color={colors.inkMuted}>
            {s.edit.merchant}
          </Text>
        ) : null}
        {field === "merchant" || all ? (
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder={s.edit.merchantPlaceholder}
            placeholderTextColor={colors.inkFaint}
            autoFocus={!all}
            onFocus={() => setFocused("merchant")}
            onBlur={() => setFocused(null)}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={onSave}
            maxLength={200}
            maxFontSizeMultiplier={1.4}
            accessibilityLabel={s.edit.merchant}
            style={[styles.input, all && focused !== "merchant" && styles.inputQuiet]}
          />
        ) : null}

        {all ? (
          <Text variant="micro" color={colors.inkMuted}>
            {s.edit.amount}
          </Text>
        ) : null}
        {field === "amount" || all ? (
          <>
            <TextInput
              value={amount}
              onChangeText={(t) => {
                setAmount(t);
                if (error) setError(null);
              }}
              placeholder={s.edit.amountPlaceholder}
              placeholderTextColor={colors.inkFaint}
              autoFocus={!all}
              onFocus={() => setFocused("amount")}
              onBlur={() => setFocused(null)}
              keyboardType="decimal-pad"
              maxFontSizeMultiplier={1.2}
              accessibilityLabel={s.edit.amount}
              style={[
                styles.input,
                styles.amountInput,
                all && focused !== "amount" && styles.inputQuiet,
                error && styles.inputError,
              ]}
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
                      accessibilityLabel={`${s.edit.currency}: ${c}`}
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
                {`${s.edit.currency}: ${r?.currency}`}
              </Text>
            )}
          </>
        ) : null}

        {all ? (
          <View style={styles.inlineRow}>
            <Text variant="micro" color={colors.inkMuted} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {s.edit.date}
            </Text>
            {dateOpen ? (
              <DateTimePicker
                value={date}
                mode="date"
                display="compact"
                maximumDate={new Date()}
                locale={INTL_LOCALE[locale]}
                accentColor={colors.brandAction}
                accessibilityLabel={s.edit.date}
                onValueChange={(_e, d) => {
                  setDate(d);
                  setDateTouched(true);
                }}
              />
            ) : (
              <PressableScale
                scaleTo={0.96}
                onPress={() => {
                  // Today until another day is picked.
                  setDateOpen(true);
                  setDateTouched(true);
                  void Haptics.selectionAsync();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${s.edit.date}: ${s.edit.addDate}`}
                style={styles.addDate}
              >
                <Text variant="body" style={styles.addDateText} color={colors.negative}>
                  {s.edit.addDate}
                </Text>
              </PressableScale>
            )}
          </View>
        ) : null}
        {field === "date" ? (
          <DateTimePicker
            value={date}
            mode="date"
            display="inline"
            maximumDate={new Date()}
            locale={INTL_LOCALE[locale]}
            accentColor={colors.brandAction}
            onValueChange={(_e, d) => {
              setDate(d);
              void Haptics.selectionAsync();
            }}
          />
        ) : null}

        {all ? (
          <Text variant="micro" color={colors.inkMuted}>
            {s.edit.category}
          </Text>
        ) : null}
        {field === "category" || all ? (
          <View style={styles.list}>
            {CATEGORIES.map((c, i) => {
              const selected = (all ? category : r?.category) === c;
              return (
                <PressableScale
                  key={c}
                  scaleTo={0.99}
                  onPress={() => {
                    if (!all) return submit({ category: c });
                    setCategory(c);
                    void Haptics.selectionAsync();
                  }}
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
            disabled={field === "merchant" ? !merchant.trim() : field === "amount" ? !amount.trim() : false}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

const useStyles = makeStyles((colors) => ({
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
  // Edit-all: only the field being typed in is green (one green per screen).
  inputQuiet: { borderWidth: 1, borderColor: colors.hairline },
  addDate: { minHeight: 44, justifyContent: "center" },
  addDateText: { fontFamily: fonts.semibold },
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
  inlineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
}));
