# Apple Developer enrollment for Todalo

Checked against Apple's documentation on 4 October 2026. Enrollment and payment remain actions for the account holder.

## Choose the account owner

The user wants **Bleat** as the publisher brand but currently has no registered company. Apple Organization enrollment requires a legal entity, so choose between establishing that entity first or Individual enrollment with the personal legal name as seller. Do not treat the brand as an existing organization or commit to a paid enrollment before this choice. App branding remains Todalo.

Use **Individual** for publication under your personal legal name. Use **Organization** for a registered legal entity; Apple requires authority to bind that entity, a D-U-N-S number, and business contact/domain details. The account owner's name determines the App Store seller identity. The program costs US$99 per year; enrollment displays the applicable local-currency price. [Apple's enrollment requirements](https://developer.apple.com/programs/enroll/)

## Enroll and subscribe

1. Use an Apple Account with two-factor authentication and current legal/contact details.
2. Install the [Apple Developer app](https://apps.apple.com/ch/app/apple-developer/id640199958) on your iPhone or Mac, and keep using the same device during enrollment.
3. Open **Account**, sign in, and choose **Enroll Now**.
4. Complete identity verification and select the appropriate entity type. Organization verification may require further steps.
5. Review Apple's agreement and the annual subscription price, then complete **Subscribe** using your Apple Account payment method.
6. Wait until Apple confirms membership is active. App enrollment uses an annually renewing subscription. [Apple's app enrollment walkthrough](https://developer.apple.com/help/account/membership/enrolling-in-the-app)

## Connect the membership to this Mac

Add the enrolled Apple Account in Xcode's account settings. Select the team and use **Manage Certificates** to create an **Apple Development** identity. Xcode can manage the development signing assets for a connected test device. [Apple's signing workflow](https://help.apple.com/xcode/mac/current/en.lproj/dev60b6fbbc7.html), [certificate management](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates)

Find the ten-character Team ID under **Membership details** in your [developer account](https://developer.apple.com/account/). Record the team and choose a permanent bundle identifier before generating the signed Todalo iOS project. [Team ID help](https://developer.apple.com/help/glossary/team-id/)

Connect an unlocked physical iPhone to this Mac and complete Xcode's device setup. Once the signing identity and device are available, resume ticket 2's install, login, relaunch, expiry and logout checks. The development identifier in the scaffold is provisional until the membership identity is chosen.
