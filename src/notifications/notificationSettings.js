export const NOTIFICATION_PREFERENCES = [
  {
    key: "ANNOUNCEMENT",
    label: "Forum",
    description: "Nove objave i saveti na stranici Forum.",
    roles: ["client", "admin"],
  },
  {
    key: "MESSAGE_RECEIVED",
    label: "Poruke",
    description: "Nove poruke u razgovorima.",
    roles: ["client", "admin"],
    aliases: ["CHAT_MESSAGE"],
  },
  {
    key: "SUBSCRIPTION_ENDING",
    label: "Članarina",
    description: "Podsetnik 7 dana pre isteka i na dan isteka članarine.",
    roles: ["client"],
    aliases: ["SUBSCRIPTION_ENDED", "SUBSCRIPTION_ASSIGNED"],
  },
  {
    key: "NEW_BOOKING",
    label: "Rezervacije",
    description: "Klijent je napravio novu rezervaciju.",
    roles: ["admin"],
  },
  {
    key: "BOOKING_CANCELED_BY_CLIENT",
    label: "Otkazivanja rezervacija",
    description: "Klijent je otkazao rezervaciju.",
    roles: ["admin"],
  },
];

export function getDefaultNotificationPreferences(role) {
  return Object.fromEntries(
    NOTIFICATION_PREFERENCES.filter((item) => item.roles.includes(role)).flatMap(
      (item) => [
        [item.key, true],
        ...(item.aliases || []).map((alias) => [alias, true]),
      ]
    )
  );
}

export function normalizeNotificationPreferences(saved = {}, role) {
  return {
    ...getDefaultNotificationPreferences(role),
    ...saved,
  };
}
