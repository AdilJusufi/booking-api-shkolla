using Booking.Domain.Entities;
using Booking.Domain.Services;
using Booking.Domain.ValueObjects;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Domain;

public class SlotGeneratorTests
{
    // E hënë — përputhet me oraret e testit. UTC == lokale në këto teste (toUtc identitet).
    private static readonly DateOnly Monday = new(2026, 8, 17);
    private static readonly DateTime YesterdayUtc = new(2026, 8, 16, 0, 0, 0, DateTimeKind.Utc);

    private static DateTime ToUtc(DateTime local) => DateTime.SpecifyKind(local, DateTimeKind.Utc);

    private static DoctorWorkingSchedule Schedule(string start, string end, int slotMinutes) => new()
    {
        DayOfWeek = Monday.DayOfWeek,
        StartTime = TimeOnly.Parse(start),
        EndTime = TimeOnly.Parse(end),
        SlotDurationMinutes = slotMinutes
    };

    private static DateTimeRange Busy(string start, string end) =>
        new(ToUtc(Monday.ToDateTime(TimeOnly.Parse(start))), ToUtc(Monday.ToDateTime(TimeOnly.Parse(end))));

    [Fact]
    public void Generate_FullMorningWindow_Returns8SlotsOf30Minutes()
    {
        var slots = SlotGenerator.Generate(
            [Schedule("08:00", "12:00", 30)], Monday, 30, ToUtc, YesterdayUtc, []);

        slots.Should().HaveCount(8);
        slots[0].Start.TimeOfDay.Should().Be(TimeSpan.FromHours(8));
        slots[^1].Start.TimeOfDay.Should().Be(new TimeSpan(11, 30, 0));
    }

    [Fact]
    public void Generate_ServiceLongerThanGrid_SlotMustFitInsideWindow()
    {
        // Shërbim 60-minutësh në grid 30-minutësh: fillimi i fundit i mundshëm 11:00.
        var slots = SlotGenerator.Generate(
            [Schedule("08:00", "12:00", 30)], Monday, 60, ToUtc, YesterdayUtc, []);

        slots.Should().HaveCount(7);
        slots[^1].Start.TimeOfDay.Should().Be(TimeSpan.FromHours(11));
    }

    [Fact]
    public void Generate_BusyPeriod_RemovesOverlappingSlot()
    {
        var slots = SlotGenerator.Generate(
            [Schedule("08:00", "12:00", 30)], Monday, 30, ToUtc, YesterdayUtc,
            [Busy("09:00", "09:30")]);

        slots.Should().HaveCount(7);
        slots.Should().NotContain(s => s.Start.TimeOfDay == TimeSpan.FromHours(9));
    }

    [Fact]
    public void Generate_AdjacentBusyPeriod_DoesNotBlockNeighbours()
    {
        // Interval gjysmë i hapur [start, end): 08:00–08:30 dhe 09:00–... nuk preken nga busy 08:30–09:00.
        var slots = SlotGenerator.Generate(
            [Schedule("08:00", "12:00", 30)], Monday, 30, ToUtc, YesterdayUtc,
            [Busy("08:30", "09:00")]);

        slots.Should().Contain(s => s.Start.TimeOfDay == TimeSpan.FromHours(8));
        slots.Should().Contain(s => s.Start.TimeOfDay == TimeSpan.FromHours(9));
        slots.Should().NotContain(s => s.Start.TimeOfDay == new TimeSpan(8, 30, 0));
    }

    [Fact]
    public void Generate_PastSlots_AreExcluded()
    {
        var nowUtc = ToUtc(Monday.ToDateTime(new TimeOnly(10, 0)));

        var slots = SlotGenerator.Generate(
            [Schedule("08:00", "12:00", 30)], Monday, 30, ToUtc, nowUtc, []);

        // Slotet deri në 10:00 (përfshirë 10:00 që fillon "tani") përjashtohen.
        slots.Should().HaveCount(3);
        slots[0].Start.TimeOfDay.Should().Be(new TimeSpan(10, 30, 0));
    }

    [Fact]
    public void Generate_TwoWindowsSameDay_NoSlotsInLunchBreak()
    {
        var slots = SlotGenerator.Generate(
            [Schedule("08:00", "12:00", 30), Schedule("13:00", "17:00", 30)],
            Monday, 30, ToUtc, YesterdayUtc, []);

        slots.Should().HaveCount(16);
        slots.Should().NotContain(s => s.Start.TimeOfDay >= TimeSpan.FromHours(12)
                                       && s.Start.TimeOfDay < TimeSpan.FromHours(13));
    }

    [Fact]
    public void Generate_DuplicateSchedules_ProduceNoDuplicateSlots()
    {
        var slots = SlotGenerator.Generate(
            [Schedule("08:00", "12:00", 30), Schedule("08:00", "12:00", 30)],
            Monday, 30, ToUtc, YesterdayUtc, []);

        slots.Should().HaveCount(8);
        slots.Select(s => s.Start).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void Generate_InvalidDuration_ReturnsEmpty()
    {
        SlotGenerator.Generate([Schedule("08:00", "12:00", 30)], Monday, 0, ToUtc, YesterdayUtc, [])
            .Should().BeEmpty();
    }

    [Fact]
    public void Generate_ServiceDoesNotFitWindow_ReturnsEmpty()
    {
        SlotGenerator.Generate([Schedule("08:00", "08:30", 30)], Monday, 45, ToUtc, YesterdayUtc, [])
            .Should().BeEmpty();
    }

    [Fact]
    public void Generate_ResultsAreSortedByStart()
    {
        var slots = SlotGenerator.Generate(
            [Schedule("13:00", "17:00", 30), Schedule("08:00", "12:00", 30)],
            Monday, 30, ToUtc, YesterdayUtc, []);

        slots.Select(s => s.Start).Should().BeInAscendingOrder();
    }
}
