using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class SpecialtyConfiguration : IEntityTypeConfiguration<Specialty>
{
    public void Configure(EntityTypeBuilder<Specialty> builder)
    {
        builder.Property(s => s.Name).HasMaxLength(100).IsRequired();
        // Përkthimet janë opsionale me qëllim: pa to bie te Name (shqip), kurrë
        // te një çelës bosh. Vetëm Name mban indeksin unik — dy specializime
        // s'duhet penguar të kenë të njëjtin emër anglisht/serbisht të papërkthyer.
        builder.Property(s => s.NameEn).HasMaxLength(100);
        builder.Property(s => s.NameSr).HasMaxLength(100);
        builder.Property(s => s.Description).HasMaxLength(1000);

        builder.HasIndex(s => s.Name).IsUnique();
    }
}
