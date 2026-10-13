using System.Net;
using Booking.Application.Common.Models;
using Booking.Infrastructure.Notifications;
using Booking.Infrastructure.Notifications.Templates;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Notifications;

/// <summary>Përmbajtja e kujtesës dhe matematika e dritares — pa DB (testet e DB-së: AppointmentReminderTests).</summary>
public class AppointmentReminderTemplateTests
{
    private const string CancelUrl = "https://www.rezervomjekun.com/terminet/7d2c0e8a-0000-4000-8000-000000000001";

    private static AppointmentReminderEmailModel Model(string? cancelUrl = CancelUrl, string? phone = "+383 38 222 333",
        string? dependent = null) => new()
    {
        RecipientFirstName = "Drita",
        DependentFullName = dependent,
        DoctorName = "Arben Gashi",
        SpecialtyName = "Stomatolog",
        ServiceName = "Pastrim dhëmbësh",
        ClinicName = "Klinika Dardania",
        BranchName = "Dega Qendër",
        BranchAddress = "Rr. Agim Ramadani 15",
        BranchCity = "Prishtinë",
        ClinicPhoneNumber = phone,
        StartLocal = new DateTime(2026, 10, 27, 9, 30, 0),
        CancelUrl = cancelUrl
    };

    [Fact]
    public void Contains_every_required_detail_in_html_and_text()
    {
        var email = EmailTemplates.AppointmentReminder(Model());

        email.Subject.Should().Be("Kujtesë: termini juaj më 27 tetor, ora 09:30");
        foreach (var body in new[] { WebUtility.HtmlDecode(email.Html), email.Text })
        {
            body.Should().Contain("Arben Gashi")
                .And.Contain("Stomatolog")
                .And.Contain("Pastrim dhëmbësh")
                .And.Contain("Klinika Dardania")
                .And.Contain("Dega Qendër, Rr. Agim Ramadani 15, Prishtinë")
                .And.Contain("e martë, 27 tetor 2026")
                .And.Contain("09:30")
                .And.Contain("10 minuta")
                .And.Contain("+383 38 222 333");
        }
    }

    [Fact]
    public void Before_cutoff_has_cancel_button_linking_to_the_appointment()
    {
        var email = EmailTemplates.AppointmentReminder(Model());

        email.Html.Should().Contain("Anuloni terminin").And.Contain($"href=\"{CancelUrl}\"");
        email.Text.Should().Contain("Anuloni terminin\n" + CancelUrl);
        email.Text.Should().Contain("kyçeni", "linku kërkon login, s'ka token magjik");
    }

    [Fact]
    public void After_cutoff_has_no_button_and_points_to_the_clinic_phone()
    {
        var email = EmailTemplates.AppointmentReminder(Model(cancelUrl: null));

        email.Html.Should().NotContain("Anuloni terminin");
        email.Text.Should().NotContain("Anuloni terminin")
            .And.Contain("lajmëroni klinikën sa më shpejt në +383 38 222 333");
    }

    [Fact]
    public void Without_a_clinic_phone_the_row_is_omitted()
    {
        var email = EmailTemplates.AppointmentReminder(Model(phone: null));

        email.Text.Should().NotContain("Telefoni i klinikës");
    }

    [Fact]
    public void Dependent_appointment_names_the_dependent()
    {
        var email = EmailTemplates.AppointmentReminder(Model(dependent: "Ana Krasniqi"));

        email.Text.Should().Contain("Ju kujtojmë terminin për Ana Krasniqi:");
    }

    [Fact]
    public void Dynamic_values_are_html_encoded()
    {
        var model = Model() with { ClinicName = "<script>x</script>" };

        EmailTemplates.AppointmentReminder(model).Html.Should().NotContain("<script>");
    }

    // ---------- Dritarja ----------

    private static readonly DateTime Now = new(2026, 3, 10, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Normal_operation_window_is_22_to_26_hours()
    {
        var (from, to) = AppointmentReminderService.ComputeWindow(Now, Now.AddMinutes(-15), new ReminderSettings());

        from.Should().Be(Now.AddHours(22));
        to.Should().Be(Now.AddHours(26));
    }

    [Fact]
    public void First_run_ever_uses_the_normal_window()
    {
        var (from, _) = AppointmentReminderService.ComputeWindow(Now, lastCompletedAt: null, new ReminderSettings());

        from.Should().Be(Now.AddHours(22));
    }

    [Fact]
    public void After_a_gap_the_window_reaches_back_to_where_coverage_stopped()
    {
        var (from, _) = AppointmentReminderService.ComputeWindow(Now, Now.AddHours(-10), new ReminderSettings());

        from.Should().Be(Now.AddHours(16), "termini pas 16h ishte në dritaren e vet gjatë 10 orëve pa ekzekutim");
    }

    [Fact]
    public void After_a_long_gap_the_floor_is_two_hours()
    {
        var (from, _) = AppointmentReminderService.ComputeWindow(Now, Now.AddDays(-3), new ReminderSettings());

        from.Should().Be(Now.AddHours(2));
    }

    [Fact]
    public void A_last_run_in_the_future_never_narrows_the_window()
    {
        var (from, _) = AppointmentReminderService.ComputeWindow(Now, Now.AddHours(5), new ReminderSettings());

        from.Should().Be(Now.AddHours(22));
    }
}
