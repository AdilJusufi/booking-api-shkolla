using Booking.Domain.Enums;
using Booking.Domain.Services;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Domain;

public class BookingPolicyTests
{
    [Theory]
    [InlineData(AppointmentStatus.Pending, AppointmentStatus.Confirmed, true)]
    [InlineData(AppointmentStatus.Pending, AppointmentStatus.CancelledByPatient, true)]
    [InlineData(AppointmentStatus.Confirmed, AppointmentStatus.Completed, true)]
    [InlineData(AppointmentStatus.Confirmed, AppointmentStatus.NoShow, true)]
    [InlineData(AppointmentStatus.CheckedIn, AppointmentStatus.InProgress, true)]
    [InlineData(AppointmentStatus.InProgress, AppointmentStatus.Completed, true)]
    [InlineData(AppointmentStatus.Completed, AppointmentStatus.Confirmed, false)]
    [InlineData(AppointmentStatus.CancelledByPatient, AppointmentStatus.Confirmed, false)]
    [InlineData(AppointmentStatus.NoShow, AppointmentStatus.Completed, false)]
    [InlineData(AppointmentStatus.Pending, AppointmentStatus.InProgress, false)]
    [InlineData(AppointmentStatus.Rescheduled, AppointmentStatus.Confirmed, false)]
    public void CanTransition_FollowsLifecycleRules(AppointmentStatus from, AppointmentStatus to, bool expected) =>
        BookingPolicy.CanTransition(from, to).Should().Be(expected);

    [Fact]
    public void IsWithinCancellationWindow_MoreThanCutoff_ReturnsTrue()
    {
        var now = new DateTime(2026, 8, 17, 8, 0, 0, DateTimeKind.Utc);
        var start = now.AddHours(13);

        BookingPolicy.IsWithinCancellationWindow(start, now, cutoffHours: 12).Should().BeTrue();
    }

    [Fact]
    public void IsWithinCancellationWindow_ExactlyCutoff_ReturnsTrue()
    {
        var now = new DateTime(2026, 8, 17, 8, 0, 0, DateTimeKind.Utc);

        BookingPolicy.IsWithinCancellationWindow(now.AddHours(12), now, cutoffHours: 12).Should().BeTrue();
    }

    [Fact]
    public void IsWithinCancellationWindow_LessThanCutoff_ReturnsFalse()
    {
        var now = new DateTime(2026, 8, 17, 8, 0, 0, DateTimeKind.Utc);

        BookingPolicy.IsWithinCancellationWindow(now.AddHours(11), now, cutoffHours: 12).Should().BeFalse();
    }

    [Theory]
    [InlineData(AppointmentStatus.Pending, true)]
    [InlineData(AppointmentStatus.Confirmed, true)]
    [InlineData(AppointmentStatus.Completed, false)]
    [InlineData(AppointmentStatus.CancelledByPatient, false)]
    [InlineData(AppointmentStatus.InProgress, false)]
    public void IsPatientModifiable_OnlyPendingAndConfirmed(AppointmentStatus status, bool expected) =>
        BookingPolicy.IsPatientModifiable(status).Should().Be(expected);
}
