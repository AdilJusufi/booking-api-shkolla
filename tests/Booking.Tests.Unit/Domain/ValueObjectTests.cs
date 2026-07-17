using Booking.Domain.Exceptions;
using Booking.Domain.ValueObjects;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Domain;

public class ValueObjectTests
{
    [Fact]
    public void TimeRange_EndBeforeStart_Throws()
    {
        var act = () => new TimeRange(new TimeOnly(12, 0), new TimeOnly(8, 0));
        act.Should().Throw<DomainException>().Which.ErrorCode.Should().Be("TIME_RANGE_INVALID");
    }

    [Fact]
    public void TimeRange_Overlaps_TrueWhenIntersecting()
    {
        var morning = new TimeRange(new TimeOnly(8, 0), new TimeOnly(12, 0));
        var overlap = new TimeRange(new TimeOnly(11, 0), new TimeOnly(13, 0));

        morning.Overlaps(overlap).Should().BeTrue();
    }

    [Fact]
    public void TimeRange_AdjacentRanges_DoNotOverlap()
    {
        var morning = new TimeRange(new TimeOnly(8, 0), new TimeOnly(12, 0));
        var afternoon = new TimeRange(new TimeOnly(12, 0), new TimeOnly(17, 0));

        morning.Overlaps(afternoon).Should().BeFalse();
    }

    [Fact]
    public void DateTimeRange_EndBeforeStart_Throws()
    {
        var start = new DateTime(2026, 8, 17, 10, 0, 0, DateTimeKind.Utc);
        var act = () => new DateTimeRange(start, start.AddMinutes(-30));

        act.Should().Throw<DomainException>();
    }

    [Fact]
    public void DateTimeRange_AdjacentRanges_DoNotOverlap()
    {
        var start = new DateTime(2026, 8, 17, 10, 0, 0, DateTimeKind.Utc);
        var first = new DateTimeRange(start, start.AddMinutes(30));
        var second = new DateTimeRange(start.AddMinutes(30), start.AddMinutes(60));

        first.Overlaps(second).Should().BeFalse();
        second.Overlaps(first).Should().BeFalse();
    }

    [Fact]
    public void DateTimeRange_ContainedRange_Overlaps()
    {
        var start = new DateTime(2026, 8, 17, 10, 0, 0, DateTimeKind.Utc);
        var outer = new DateTimeRange(start, start.AddHours(2));
        var inner = new DateTimeRange(start.AddMinutes(30), start.AddMinutes(60));

        outer.Overlaps(inner).Should().BeTrue();
        inner.Overlaps(outer).Should().BeTrue();
    }
}
