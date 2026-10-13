namespace Booking.Infrastructure.Persistence;

/// <summary>
/// Kujtesa e një pune në sfond: kur përfundoi për herë të fundit PA LËNË GJË PAS (pa
/// kuotë të shteruar, pa dështim dërgimi). Ruhet në DB dhe jo në memorie sepse rasti që
/// na intereson është pikërisht kur procesi fle (Render free) ose rindizet — atëherë
/// memoria humbet, dhe vetëm kjo vlerë tregon sa kohë mbeti puna pa u ekzekutuar.
/// </summary>
public class BackgroundJobState
{
    public string Name { get; set; } = null!;

    public DateTime LastCompletedAt { get; set; }
}
