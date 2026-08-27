using System.Net;
using Booking.Infrastructure.Notifications.Templates;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Notifications;

/// <summary>
/// Këto teste ekzistojnë sepse email-i real i prodhimit dikur nxori tokenin e
/// papërpunuar te useri — pikërisht sepse asgjë s'e provoi kurrë se linku vërtet
/// funksionon dhe se tokeni s'del kurrgjëkundi tjetër. Çdo assert këtu lidhet
/// direkt me një kërkesë konkrete nga raporti: buton, fallback, expiry, plain-text,
/// dhe — mbi të gjitha — asnjëherë token i zhveshur jashtë URL-së.
/// </summary>
public class EmailTemplatesTests
{
    private const string FirstName = "Filan";
    // Karaktere si '+', '/', '=' janë të zakonshme në token-at base64 të Identity —
    // nëse encoding-u i URL-së/HTML-së është i gabuar, pikërisht këto e zbulojnë.
    private const string RawToken = "CfDJ8F6OOuj9k+Ed/Bs8sz4sBM=WCf0ePFV2/PUG+UE4oRPTx==";
    private const string ConfirmUrl = "https://www.rezervomjekun.com/konfirmo-email?token=CfDJ8F6OOuj9k%2BEd%2FBs8sz4sBM%3DWCf0ePFV2%2FPUG%2BUE4oRPTx%3D%3D&email=filan%40shembull.com";
    private const string ResetUrl = "https://www.rezervomjekun.com/rivendos-fjalekalimin?token=CfDJ8F6OOuj9k%2BEd%2FBs8sz4sBM%3DWCf0ePFV2%2FPUG%2BUE4oRPTx%3D%3D&email=filan%40shembull.com";
    private const string ResendUrl = "https://www.rezervomjekun.com/konfirmo-email/ridergo";
    private const string ForgotPasswordUrl = "https://www.rezervomjekun.com/harrova-fjalekalimin";

    // ---------- Kërkesa qendrore: tokeni KURRË jashtë URL-së ----------

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Confirmation_RawTokenNeverAppearsOutsideTheUrl(bool withResendUrl)
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, withResendUrl ? ResendUrl : null);

        AssertTokenOnlyInsideUrl(email.Html, ConfirmUrl, RawToken, isHtml: true);
        AssertTokenOnlyInsideUrl(email.Text, ConfirmUrl, RawToken, isHtml: false);
    }

    [Fact]
    public void PasswordReset_RawTokenNeverAppearsOutsideTheUrl()
    {
        var email = EmailTemplates.PasswordReset(FirstName, ResetUrl, ForgotPasswordUrl);

        AssertTokenOnlyInsideUrl(email.Html, ResetUrl, RawToken, isHtml: true);
        AssertTokenOnlyInsideUrl(email.Text, ResetUrl, RawToken, isHtml: false);
    }

    /// <summary>
    /// Heq çdo shfaqje TË PLOTË të URL-së (të koduar si atribut HTML, kur është rasti)
    /// dhe kontrollon që vetë tokeni i papërpunuar s'ka mbetur diku tjetër — pikërisht
    /// rregresioni real i prodhimit.
    /// </summary>
    private static void AssertTokenOnlyInsideUrl(string content, string fullUrl, string rawToken, bool isHtml)
    {
        var urlAsItAppears = isHtml ? WebUtility.HtmlEncode(fullUrl) : fullUrl;
        content.Should().Contain(urlAsItAppears, "linku i plotë duhet të jetë present diku në email");
        var withoutUrl = content.Replace(urlAsItAppears, "");
        withoutUrl.Should().NotContain(rawToken);
        withoutUrl.Should().NotContain("Tokeni i konfirmimit:", "kjo është saktësisht fraza që doli e thyer në prodhim");
        withoutUrl.Should().NotContain("Tokeni për rivendosje:");
    }

    // ---------- Buton i dukshëm me etiketën e saktë ----------

    [Fact]
    public void Confirmation_HasButtonWithExactLabelAndCorrectHref()
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().Contain($"href=\"{WebUtility.HtmlEncode(ConfirmUrl)}\"");
        email.Html.Should().Contain(">Konfirmo Email-in<");
    }

    [Fact]
    public void PasswordReset_HasButtonWithExactLabelAndCorrectHref()
    {
        var email = EmailTemplates.PasswordReset(FirstName, ResetUrl, ForgotPasswordUrl);

        email.Html.Should().Contain($"href=\"{WebUtility.HtmlEncode(ResetUrl)}\"");
        email.Html.Should().Contain($">{WebUtility.HtmlEncode("Rivendos Fjalëkalimin")}<");
    }

    [Fact]
    public void Confirmation_ButtonIsATableCellAnchor_NotAButtonElement()
    {
        // Kërkesë eksplicite: <button> injorohet nga shumë klientë email-i.
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().NotContain("<button");
        email.Html.Should().Contain("<table");
        email.Html.Should().Contain("<a href=");
    }

    // ---------- Fallback URL i dukshëm ----------

    [Fact]
    public void Confirmation_ShowsVisibleFallbackUrlBelowButton()
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().Contain("Nëse butoni nuk funksionon");
        // Shfaqet dy herë në HTML: një herë si href i butonit, një herë si tekst i lexueshëm.
        var occurrences = email.Html.Split(WebUtility.HtmlEncode(ConfirmUrl)).Length - 1;
        occurrences.Should().BeGreaterOrEqualTo(2, "URL-ja duhet të shfaqet edhe si href i butonit, edhe si tekst i thjeshtë poshtë");
    }

    // ---------- Skadimi ----------

    [Fact]
    public void Confirmation_MentionsTwentyFourHourExpiry()
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().Contain("24 orë");
        email.Text.Should().Contain("24 orë");
    }

    [Fact]
    public void Confirmation_ExpiredLinkGuidance_LinksToResendPage_WhenAvailable()
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().Contain(WebUtility.HtmlEncode(ResendUrl));
        email.Text.Should().Contain(ResendUrl);
    }

    [Fact]
    public void PasswordReset_MentionsExpiryAndForgotPasswordFallback()
    {
        var email = EmailTemplates.PasswordReset(FirstName, ResetUrl, ForgotPasswordUrl);

        email.Html.Should().Contain("24 orë");
        email.Html.Should().Contain(WebUtility.HtmlEncode(ForgotPasswordUrl));
    }

    // ---------- Plain-text dërgohet GJITHMONË bashkë me HTML ----------

    [Fact]
    public void Confirmation_ProducesNonEmptyDistinctHtmlAndText()
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().NotBeNullOrWhiteSpace();
        email.Text.Should().NotBeNullOrWhiteSpace();
        email.Html.Should().NotBe(email.Text, "text s'duhet të jetë thjesht HTML-i i pashpërndarë");
        email.Html.Should().Contain("<table");
        email.Text.Should().NotContain("<table", "text s'duhet të mbajë markup HTML");
    }

    [Fact]
    public void PasswordReset_TextAlternativeContainsSameUrlAsHtml()
    {
        var email = EmailTemplates.PasswordReset(FirstName, ResetUrl, ForgotPasswordUrl);

        email.Text.Should().Contain(ResetUrl);
        email.Html.Should().Contain(WebUtility.HtmlEncode(ResetUrl));
    }

    // ---------- Struktura HTML e emailit (tabela, jo flex/grid) ----------

    [Fact]
    public void Wrap_ProducesTableBasedLayout_NoFlexOrGridOrStyleBlocks()
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().NotContain("display:flex");
        email.Html.Should().NotContain("display: flex");
        email.Html.Should().NotContain("display:grid");
        email.Html.Should().NotContain("<style", "klientë si Gmail e heqin <style> — çdo stil duhet inline");
        email.Html.Should().Contain("role=\"presentation\"");
    }

    [Fact]
    public void Wrap_IncludesBrandHeaderAndFooter()
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().Contain("Rezervo");
        email.Html.Should().Contain("Mjekun");
        email.Html.Should().Contain("#12796e", "ngjyra e markës duhet përdorur diku (buton/wordmark)");
        email.Html.Should().Contain("Rezervo Mjekun", "footer duhet të thotë qartë nga vjen email-i");
    }

    [Fact]
    public void Wrap_SetsLightOnlyColorScheme_ToAvoidUnwantedDarkModeInversion()
    {
        var email = EmailTemplates.Confirmation(FirstName, ConfirmUrl, ResendUrl);

        email.Html.Should().Contain("name=\"color-scheme\" content=\"light\"");
        email.Html.Should().NotContain("#000000");
        email.Html.Should().NotContain("#ffffff;color:#ffffff");
    }

    // ---------- Klinikë: buton dhe fallback, dhe rasti "pa BaseUrl" ----------

    [Fact]
    public void ClinicApproved_IncludesButton_WhenUrlProvided()
    {
        var email = EmailTemplates.ClinicApproved("Klinika Dardania", "https://www.rezervomjekun.com/admin-panel/klinikat");

        email.Html.Should().Contain($">{WebUtility.HtmlEncode("Shiko Klinikën Time")}<");
        email.Text.Should().Contain("https://www.rezervomjekun.com/admin-panel/klinikat");
    }

    [Fact]
    public void ClinicApproved_DegradesGracefully_WithoutThrowing_WhenUrlIsNull()
    {
        var act = () => EmailTemplates.ClinicApproved("Klinika Dardania", myClinicsUrl: null);

        act.Should().NotThrow();
        var email = act();
        email.Html.Should().NotContain("href=\"\"", "s'duhet të mbetet një href bosh kur s'ka URL");
    }

    [Fact]
    public void ClinicPendingReview_GreetsByNameAndMentionsClinic()
    {
        var email = EmailTemplates.ClinicPendingReview("Agim Krasniqi", "Klinika Dardania", "https://www.rezervomjekun.com/admin-panel/klinikat");

        email.Html.Should().Contain("Agim Krasniqi");
        email.Html.Should().Contain("Klinika Dardania");
        email.Text.Should().Contain("Agim Krasniqi");
    }

    [Fact]
    public void ClinicPendingReview_EncodesClinicNameInHtml_ToPreventMarkupInjection()
    {
        var email = EmailTemplates.ClinicPendingReview("Agim Krasniqi", "Klinika <script>alert(1)</script>", null);

        email.Html.Should().NotContain("<script>");
        email.Html.Should().Contain("&lt;script&gt;");
    }

    // ---------- SuperAdmin: trajtim i thjeshtë, jo buton i madh CTA ----------

    [Fact]
    public void NewClinicAwaitingReview_UsesPlainLinkNotBigButton()
    {
        var email = EmailTemplates.NewClinicAwaitingReview(
            "Klinika Dardania", Guid.NewGuid(), "+383 44 000 000", "info@dardania.dev", "https://dardania.dev",
            ["Prishtinë", "Prizren"], "Agim Krasniqi", "agim@dardania.dev", "+383 44 111 111",
            DateTime.UtcNow, clinicsWithSameName: 0, reviewUrl: "https://www.rezervomjekun.com/super-admin/klinikat");

        // Trajtim i thjeshtë: pa qelizën e madhe të ngjyrosur të EmailLayout.Button.
        email.Html.Should().NotContain("padding:14px 36px", "SuperAdmin duhet të marrë trajtim më të thjeshtë, jo buton i madh CTA");
        email.Html.Should().Contain("Shiko në panelin e rishikimit");
        email.Html.Should().Contain("Klinika Dardania");
        email.Html.Should().Contain(WebUtility.HtmlEncode("Prishtinë, Prizren"));
    }

    [Fact]
    public void NewClinicAwaitingReview_FlagsWhenOtherClinicsShareTheName()
    {
        var email = EmailTemplates.NewClinicAwaitingReview(
            "Klinika Dardania", Guid.NewGuid(), null, null, null,
            [], "Agim Krasniqi", "agim@dardania.dev", null,
            DateTime.UtcNow, clinicsWithSameName: 2, reviewUrl: null);

        email.Html.Should().Contain("2 klinikë tjetër");
        email.Text.Should().Contain("2 klinikë tjetër");
    }
}
