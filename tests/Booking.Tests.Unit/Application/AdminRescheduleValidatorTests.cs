using Booking.Application.Features.Admin;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Application;

/// <summary>
/// AdminRescheduleAppointmentRequest ishte një nga dy DTO-të që kalonin pa validator:
/// FluentValidationFilter thjesht i anashkalonte pa asnjë shenjë. Ndalimi për datat e
/// kaluara zbatohej te AdminAppointmentService, por kufiri 180-ditësh — që rruga e
/// pacientit e ka — mungonte plotësisht.
/// </summary>
public class AdminRescheduleValidatorTests
{
    private readonly AdminRescheduleAppointmentRequestValidator _validator = new();

    private static AdminRescheduleAppointmentRequest At(DateTime when) => new() { NewStartDateTime = when };

    [Fact]
    public void Accepts_a_date_inside_the_booking_horizon()
    {
        _validator.Validate(At(DateTime.UtcNow.AddDays(30))).IsValid.Should().BeTrue();
    }

    [Fact]
    public void Rejects_a_date_beyond_180_days__the_gap_this_validator_was_added_to_close()
    {
        var result = _validator.Validate(At(DateTime.UtcNow.AddDays(400)));

        result.IsValid.Should().BeFalse();
        result.Errors.Should().ContainSingle()
            .Which.ErrorMessage.Should().Contain("180");
    }

    [Fact]
    public void Rejects_a_date_well_in_the_past()
    {
        _validator.Validate(At(DateTime.UtcNow.AddDays(-30))).IsValid.Should().BeFalse();
    }

    /// <summary>
    /// I njëjti tolerancë prej dy ditësh si te rruga e pacientit: kërkesa mbart orën e
    /// Prishtinës ndërsa kufiri krahasohet me UTC, prandaj një zonë e ngushtë rreth "tani"
    /// duhet të mbetet e vlefshme, përndryshe një riplanifikim krejt i ligjshëm për sot
    /// do të refuzohej për shkak të zhvendosjes.
    /// </summary>
    [Fact]
    public void Tolerates_the_recent_past_so_timezone_offset_does_not_reject_today()
    {
        _validator.Validate(At(DateTime.UtcNow.AddHours(-6))).IsValid.Should().BeTrue();
    }
}
