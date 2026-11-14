// "Connect Gmail" / "Connect Outlook": one button per configured provider,
// most likely first (orderProviders), each opening our explainer for that
// provider. On the empty state the first is ink and the others outline (the
// scan button is the screen's green); in the first run they are an outline
// pair, like the website (the green is the explainer's Continue).

import { View } from "react-native";
import { s } from "../i18n";
import type { MailboxProvider } from "../lib/mailboxes";
import { useMailboxes } from "../lib/MailboxesProvider";
import { space, makeStyles } from "../theme";
import { Button } from "./Button";

export function ConnectButtons({
  providers,
  lead = false,
}: {
  /** Already in order. */
  providers: readonly MailboxProvider[];
  /** The first button filled in ink. */
  lead?: boolean;
}) {
  const styles = useStyles();
  const { connect, connecting } = useMailboxes();
  return (
    <View style={styles.list}>
      {providers.map((p, i) => (
        <Button
          key={p}
          kind={lead && i === 0 ? "ink" : "outline"}
          label={p === "google" ? s.mailboxes.connectGoogle : s.mailboxes.connectMicrosoft}
          busy={connecting === p}
          disabled={connecting != null}
          onPress={() => connect(p)}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  list: { alignSelf: "stretch", gap: space.sm },
}));
